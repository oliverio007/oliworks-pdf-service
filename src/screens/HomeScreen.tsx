// src/screens/HomeScreen.tsx

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  RefreshControl,
} from "react-native";
import { ActionSheetIOS } from "react-native";

import { syncPendings } from "../storage/db";


import { runBootstrapSync } from "../storage/bootstrapSync";
import { getPendingInstruments } from "@/production/rules";
import { supabase } from "../lib/supabase";

import { useIsFocused, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { getDailyBriefing } from "../api/dailyBriefing";
import { HomeStackParamList } from "../../App";

import {
  loadAgenda,
  loadPendings,
  loadProjects,
  upsertProject,
  deleteProject,
  togglePending,
  deletePending,
  addPending,
  softDeleteProject,

  // perfiles artista
  loadArtistProfiles,
  renameArtistDisplayName,
  syncArtistProfiles,

  // sync principal
  syncProjects,

  // ✅ borrar artista + cascade
  deleteArtistCascade,

  // util
  formatDateEs,
  normalizeArtistLocalId,

  // ✅ (ya lo usas abajo)
  upsertArtistProfile,
} from "../storage/db";

import { AgendaItem, PendingItem, Project } from "../types";
import { Card, ProgressBar, PrimaryButton } from "../ui/components";

declare const __DEV__: boolean;

type Nav = NativeStackNavigationProp<HomeStackParamList>;

// OJO: este es “key virtual” solo para UI (cuando un tema no trae key)
const SIN_ARTISTA_KEY = "(Sin artista)";

const DevTestersMod = __DEV__ ? require("../dev/testers") : null;
const DevTesters = DevTestersMod?.default ?? DevTestersMod;

// ------------------------
// HELPERS (fuera del componente está OK)
// ------------------------

function pickString(...vals: any[]) {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function normalizeDateLabel(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function resolveProjectTitle(p: any) {
  const title = pickString(
    p?.title,
    p?.project_title,
    p?.projectTitle,
    p?.name,
    p?.projectName,
    p?.data?.title,
    p?.data?.project_title
  );

  const localId = pickString(p?.local_id, p?.localId);
  const idShort = pickString(p?.id)?.slice(0, 8);

  return title || `Tema (${localId || idShort || "local_"})`;
}

function resolveProjectDateLabel(p: any) {
  const raw = pickString(
    p?.dateLabel,
    p?.date_label,
    p?.date,
    p?.updated_at,
    p?.updatedAt,
    p?.created_at,
    p?.createdAt
  );

  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) return normalizeDateLabel(new Date(n).toISOString());

  return normalizeDateLabel(raw);
}

// ------------------------
// HOME
// ------------------------

export default function HomeScreen() {
  const nav = useNavigation<Nav>();
  const isFocused = useIsFocused();

  // ✅ refs / state (deben ir ANTES de usarlos)
  const syncingRef = React.useRef(false);
  const didBootstrapRef = React.useRef(false);
  const loggedProjectsRef = React.useRef<Record<string, boolean>>({});

  const [isRefreshing, setIsRefreshing] = useState(false);

  // ------------------------ auth session log (HOOK DENTRO DEL COMPONENTE) ------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      console.log("ACCESS TOKEN:", data.session?.access_token);
    });
  }, []);

  // ------------------------ state ------------------------
  const [devOpen, setDevOpen] = useState(false);

  type DevItem = { key: string; label: string; run: () => void };

  const devItems: DevItem[] = useMemo(() => {
    if (!__DEV__ || !DevTesters) return [];
    return [
      {
        key: "dbg",
        label: "debug keys",
        run: () => Alert.alert("keys", Object.keys(DevTesters || {}).join(", ")),
      },
      { key: "ai-ask", label: "ai-ask", run: () => DevTesters.testAiAsk() },
      { key: "ai-router", label: "ai-router", run: () => DevTesters.testAiRouter() },
      { key: "projects-summary", label: "projects-summary", run: () => DevTesters.testProjectsSummary() },
      { key: "projects-query", label: "projects-query", run: () => DevTesters.testProjectsQuery() },
      { key: "projects-resync-hard", label: "projects-resync-hard", run: () => DevTesters.testForceResyncProjects() },
      { key: "wallet-summary", label: "wallet-summary", run: () => DevTesters.testWalletSummary() },
      { key: "project-financials", label: "project-financials", run: () => DevTesters.testProjectFinancials() },
      { key: "artists-financials3", label: "artists-financials3", run: () => DevTesters.testArtistsFinancials3() },
      { key: "daily-plan", label: "daily-plan", run: () => DevTesters.testDailyPlan() },
      { key: "wallet-rls", label: "wallet RLS (direct)", run: () => DevTesters.testWalletRLSDirect() },
    ];
  }, []);

  const [projects, setProjects] = useState<Project[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [pendings, setPendings] = useState<PendingItem[]>([]);

  // maps por artistKey (slug)
  const [artistNotesMap, setArtistNotesMap] = useState<Record<string, string>>({});
  const [artistDisplayMap, setArtistDisplayMap] = useState<Record<string, string>>({});

  const [openProjects, setOpenProjects] = useState(true);
  const [openArchive, setOpenArchive] = useState(false);
  const [openAgenda, setOpenAgenda] = useState(false);
  const [openPend, setOpenPend] = useState(false);

  const [pendingText, setPendingText] = useState("");
  const [artistOpenMap, setArtistOpenMap] = useState<Record<string, boolean>>({});
  const [archiveOpenMap, setArchiveOpenMap] = useState<Record<string, boolean>>({});

  // Renombrar
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameMode, setRenameMode] = useState<"title" | "artist">("title");
  const [renameValue, setRenameValue] = useState("");
  const [renameProject, setRenameProject] = useState<Project | null>(null);
  const [renameArtistKey, setRenameArtistKey] = useState<string | null>(null);

  const openDevMenu = useCallback(() => {
    if (!__DEV__ || !DevTesters) return;
    setDevOpen(true);
  }, []);

  // ---------------- helpers ----------------

  function prettyFromKey(key: string) {
    const s = String(key || "").replace(/_/g, " ").trim();
    return s.replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function todayYYYYMMDD() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function resolveArtistDisplayName(artistKey: string, fallbackArtistText?: string) {
    if (!artistKey || artistKey === SIN_ARTISTA_KEY) {
      return fallbackArtistText?.trim() || "Sin artista";
    }

    const display = artistDisplayMap[artistKey];
    if (display && display.trim()) return display;

    if (fallbackArtistText && fallbackArtistText.trim()) {
      return fallbackArtistText.trim();
    }

    return artistKey
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  // 🔥 Reverse map displayName -> key (sirve para “resolver” proyectos que vienen sin key)
  const artistKeyByDisplayLower = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [k, display] of Object.entries(artistDisplayMap || {})) {
      const dl = String(display || "").trim().toLowerCase();
      if (dl && !m[dl]) m[dl] = k;
    }
    return m;
  }, [artistDisplayMap]);

  // ✅ ref para evitar que refresh dependa de esto
  const artistKeyByDisplayLowerRef = React.useRef<Record<string, string>>({});
  useEffect(() => {
    artistKeyByDisplayLowerRef.current = artistKeyByDisplayLower;
  }, [artistKeyByDisplayLower]);

  function getRawArtistKeyFromProject(p: any): string {
    const k1 = String(p?.artistLocalId ?? p?.artist_local_id ?? "").trim();
    if (k1) return normalizeArtistLocalId(k1) || SIN_ARTISTA_KEY;

    const name = String(p?.artist ?? "").trim();
    const dl = name.toLowerCase();
    const byDisplay = artistKeyByDisplayLowerRef.current[dl];
    if (byDisplay) return normalizeArtistLocalId(byDisplay) || SIN_ARTISTA_KEY;

    const k2 = normalizeArtistLocalId(name);
    return k2 || SIN_ARTISTA_KEY;
  }

  function buildCanonicalKeyMap(baseProjects: any[], displayMap: Record<string, string>) {
    const countByKey = new Map<string, number>();
    for (const p of baseProjects) {
      const rawKey = getRawArtistKeyFromProject(p);
      if (!rawKey) continue;
      countByKey.set(rawKey, (countByKey.get(rawKey) || 0) + 1);
    }

    const keysByDisplay = new Map<string, string[]>();
    for (const k of Object.keys(displayMap || {})) {
      const d = String(displayMap[k] || "").trim().toLowerCase();
      if (!d) continue;
      if (!keysByDisplay.has(d)) keysByDisplay.set(d, []);
      keysByDisplay.get(d)!.push(k);
    }

    const canonicalByDisplay = new Map<string, string>();
    for (const [d, keys] of keysByDisplay.entries()) {
      const sorted = [...keys].sort((a, b) => {
        const ca = countByKey.get(a) || 0;
        const cb = countByKey.get(b) || 0;
        if (cb !== ca) return cb - ca;
        return String(a).localeCompare(String(b));
      });
      canonicalByDisplay.set(d, sorted[0]);
    }

    const canonicalByKey: Record<string, string> = {};
    for (const [k, dName] of Object.entries(displayMap || {})) {
      const d = String(dName || "").trim().toLowerCase();
      const canon = canonicalByDisplay.get(d);
      if (canon) canonicalByKey[k] = canon;
    }

    return canonicalByKey;
  }

  // ---------------- refresh (SINGLE SOURCE OF TRUTH) ----------------

// ---------------- refresh (SINGLE SOURCE OF TRUTH) ----------------
const refresh = useCallback(async () => {
  // 1) preload rápido
  try {
    const [projs, ag] = await Promise.all([
      loadProjects(),
      loadAgenda(),
    ]);
    setProjects(projs as any);
    setAgenda(ag);
  } catch (e) {
    console.log("[Home] preload failed:", e);
  }

  // 2) sync (solo uno a la vez)
  if (!syncingRef.current) {
    syncingRef.current = true;
    try {
      await syncProjects();
      await syncPendings();
      await syncArtistProfiles();
    } catch (e) {
      console.log("[Home] sync failed:", e);
    } finally {
      syncingRef.current = false;
    }
  }

  // 3) reload fuente de verdad
  try {
    const [projsAfter, pendAfter] = await Promise.all([
      loadProjects(),
      loadPendings(),
    ]);
    setProjects(projsAfter as any);
    setPendings(pendAfter);
  } catch (e) {
    console.log("[Home] reload after sync failed:", e);
  }
}, []);


 // 🔄 Pull to refresh
const onPullRefresh = useCallback(async () => {
  if (isRefreshing || syncingRef.current) return;

  setIsRefreshing(true);
  try {
    await refresh();
  } catch (e) {
    console.log("[Home] pull-to-refresh failed:", e);
  } finally {
    setIsRefreshing(false);
  }
}, [refresh, isRefreshing]);


  // ---------------- focus effect ----------------

  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;

    (async () => {
      await refresh();

      // ✅ bootstrap SOLO una vez por focus
      if (!didBootstrapRef.current) {
        didBootstrapRef.current = true;

        try {
          const r = await runBootstrapSync({ maxAgeMs: 6 * 60 * 60 * 1000 });
          if (!cancelled && r.didSync) {
            await refresh();
          }
        } catch (e) {
          console.log("[bootstrapSync] failed:", e);
        }
      }

      // briefing
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!cancelled && !error && data.session) {
          const briefing = await getDailyBriefing();
          if (briefing) console.log("DAILY BRIEFING OK:", briefing);
        }
      } catch (e) {
        console.log("Daily briefing failed (non-blocking):", e);
      }
    })();

    return () => {
      cancelled = true;

      // ⚠️ Si quieres reintentar bootstrap cada vez que vuelvas a enfocar Home, descomenta:
      // didBootstrapRef.current = false;
    };
  }, [isFocused, refresh]);

  // ---------------- derived ----------------

  const inProcess = useMemo(
    () => projects.filter((p: any) => !p.deletedAt && p.status !== "ARCHIVO"),
    [projects]
  );

  const inProcessSorted = useMemo(
    () => [...inProcess].sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [inProcess]
  );

  const archived = useMemo(
    () => projects.filter((p: any) => !p.deletedAt && !p.deleted_at && p.status === "ARCHIVO"),
    [projects]
  );

  const archivedSorted = useMemo(
    () => [...archived].sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0)),
    [archived]
  );

  const canonicalKeyByKeyArchive = useMemo(() => {
    const archNow = (archivedSorted as any[]).filter(
      (p) => p.status === "ARCHIVO" && !p.deletedAt && !p.deleted_at
    );
    return buildCanonicalKeyMap(archNow, artistDisplayMap);
  }, [archivedSorted, artistDisplayMap]);

  function canonicalizeKeyArchive(rawKey: string) {
    if (!rawKey || rawKey === SIN_ARTISTA_KEY) return SIN_ARTISTA_KEY;
    return canonicalKeyByKeyArchive[rawKey] || rawKey;
  }

  function getArtistKeyForGroupingArchive(p: any) {
    const rawKey = getRawArtistKeyFromProject(p);
    return canonicalizeKeyArchive(rawKey);
  }

  function getArtistDisplayFromKey(key: string, fallbackArtistText?: string) {
    if (!key || key === SIN_ARTISTA_KEY) return SIN_ARTISTA_KEY;
    const fromMap = artistDisplayMap[key];
    if (fromMap && fromMap.trim()) return fromMap;
    const fb = String(fallbackArtistText || "").trim();
    return fb || prettyFromKey(key);
  }

  const groupedArchiveByArtist = useMemo(() => {
    const m = new Map<string, Project[]>();

    for (const p of archivedSorted as any[]) {
      const groupKey = getArtistKeyForGroupingArchive(p);
      if (!m.has(groupKey)) m.set(groupKey, []);
      m.get(groupKey)!.push(p as any);
    }

    const out = Array.from(m.entries()).map(([artistKey, items]) => {
      const display = getArtistDisplayFromKey(artistKey, String((items[0] as any)?.artist ?? "").trim());
      return { artistKey, artistName: display, items };
    });

    out.sort((a, b) => String(a.artistName).localeCompare(String(b.artistName), "es"));
    return out;
  }, [archivedSorted, artistDisplayMap, canonicalKeyByKeyArchive]);

  useEffect(() => {
    setArchiveOpenMap((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const g of groupedArchiveByArtist) {
        if (next[g.artistKey] == null) next[g.artistKey] = g.items.length <= 2;
      }
      return next;
    });
  }, [groupedArchiveByArtist]);

  const canonicalKeyByKey = useMemo(() => {
    const inProcNow = (inProcessSorted as any[]).filter(
      (p) => p.status !== "ARCHIVO" && !p.deletedAt && !p.deleted_at
    );
    return buildCanonicalKeyMap(inProcNow, artistDisplayMap);
  }, [inProcessSorted, artistDisplayMap]);

  function canonicalizeKey(rawKey: string) {
    if (!rawKey || rawKey === SIN_ARTISTA_KEY) return SIN_ARTISTA_KEY;
    return canonicalKeyByKey[rawKey] || rawKey;
  }

  function getArtistKeyForGrouping(p: any) {
    const rawKey = getRawArtistKeyFromProject(p);
    return canonicalizeKey(rawKey);
  }

  const groupedByArtist = useMemo(() => {
    const m = new Map<string, Project[]>();

    for (const p of inProcessSorted as any[]) {
      const groupKey = getArtistKeyForGrouping(p);
      if (!m.has(groupKey)) m.set(groupKey, []);
      m.get(groupKey)!.push(p as any);
    }

    const out = Array.from(m.entries()).map(([artistKey, items]) => {
      const display = getArtistDisplayFromKey(artistKey, String((items[0] as any)?.artist ?? "").trim());
      return { artistKey, artistName: display, items };
    });

    out.sort((a, b) => String(a.artistName).localeCompare(String(b.artistName), "es"));
    return out;
  }, [inProcessSorted, artistDisplayMap, canonicalKeyByKey]);

  useEffect(() => {
    setArtistOpenMap((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const g of groupedByArtist) {
        if (next[g.artistKey] == null) next[g.artistKey] = g.items.length <= 2;
      }
      return next;
    });
  }, [groupedByArtist]);

  // ✅ Agenda: solo HOY y próximos
  const agendaUpcoming = useMemo(() => {
    const today = todayYYYYMMDD();
    return [...agenda]
      .filter((a: any) => !a.deletedAt && String(a.dateLabel || "") >= today)
      .sort((a: any, b: any) => String(a.dateLabel || "").localeCompare(String(b.dateLabel || ""), "es"));
  }, [agenda]);

  const pendSorted = useMemo(() => [...pendings].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)), [pendings]);

  // ---------------- actions ----------------

  function onArtistLongPress(artistKey: string, artistName: string, countThemes: number) {
    if (!artistKey || artistKey === SIN_ARTISTA_KEY) {
      Alert.alert("No disponible", "Este bloque no corresponde a un artista real.");
      return;
    }

    const title = artistName?.trim() || artistKey;
    const msg = `Se borrará "${title}" y sus ${countThemes} tema(s).\n\nEsto NO se puede deshacer.`;

    const runConfirm = () => {
      Alert.alert("Borrar artista", msg, [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Borrar todo",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteArtistCascade({ artistKey });
            } catch (e: any) {
              console.log("[Home] deleteArtistCascade failed:", e);
              Alert.alert("No se pudo borrar", e?.message ?? String(e));
            } finally {
              await refresh();
            }
          },
        },
      ]);
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(msg);
      if (!ok) return;
      (async () => {
        try {
          await deleteArtistCascade({ artistKey });
        } catch (e: any) {
          console.log("[Home] deleteArtistCascade failed:", e);
          alert(e?.message ?? String(e));
        } finally {
          await refresh();
        }
      })();
      return;
    }

    if (Platform.OS === "ios") {
      const options = ["Cancelar", "Borrar artista + temas"];
      ActionSheetIOS.showActionSheetWithOptions(
        { title, message: msg, options, cancelButtonIndex: 0, destructiveButtonIndex: 1 },
        (i) => {
          if (i === 1) runConfirm();
        }
      );
      return;
    }

    runConfirm();
  }

  function confirmDelete(p: any) {
    const groupKey = getArtistKeyForGrouping(p);
    const artistLabel = getArtistDisplayFromKey(groupKey, String(p?.artist ?? ""));

    Alert.alert("Borrar tema", `¿Seguro que quieres borrar “${resolveProjectTitle(p)}” de ${artistLabel}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          await softDeleteProject(p.id);

          try {
            await syncProjects();
          } catch (e) {
            console.log("[Home] syncProjects after delete failed:", e);
          }

          await refresh();
        },
      },
    ]);
  }

  function openRename(p: any, mode: "title" | "artist") {
    setRenameProject(p);
    setRenameMode(mode);

    if (mode === "title") {
      setRenameValue(String(resolveProjectTitle(p)));
      setRenameArtistKey(null);
    } else {
      const rawKey = getRawArtistKeyFromProject(p);
      const key = canonicalizeKey(rawKey);
      if (!key || key === SIN_ARTISTA_KEY) {
        Alert.alert("No disponible", "Este tema no tiene artista asignado.");
        return;
      }
      setRenameArtistKey(key);
      setRenameValue(artistDisplayMap[key] || String(p.artist ?? ""));
    }

    setRenameOpen(true);
  }

  async function saveRename() {
    if (!renameProject) return;

    const v = renameValue.trim();
    if (!v) return;

    if (renameMode === "title") {
      const next: any = { ...renameProject, updatedAt: Date.now(), title: v };
      await upsertProject(next);

      setRenameOpen(false);
      setRenameProject(null);

      await refresh();
      return;
    }

    if (!renameArtistKey) return;

    try {
      await renameArtistDisplayName({ artistKey: renameArtistKey, newDisplayName: v });
      await syncArtistProfiles();
    } catch (e) {
      console.log("[Home] rename artist failed:", e);
    }

    setRenameOpen(false);
    setRenameProject(null);
    setRenameArtistKey(null);

    await refresh();
  }

  function openDotsMenu(p: any) {
    const groupKey = getArtistKeyForGrouping(p);
    const artistLabel = getArtistDisplayFromKey(groupKey, String(p?.artist ?? ""));

    if (Platform.OS === "web") {
      const ok = window.confirm(`¿Borrar “${resolveProjectTitle(p)}” de ${artistLabel}?`);
      if (!ok) return;
      (async () => {
        await deleteProject(p.id);
        await refresh();
      })();
      return;
    }

    if (Platform.OS === "ios") {
      const options = ["Cancelar", "Renombrar artista", "Renombrar tema", "Borrar tema"];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
          title: "Opciones",
          message: `${artistLabel} — ${resolveProjectTitle(p)}`,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) openRename(p, "artist");
          if (buttonIndex === 2) openRename(p, "title");
          if (buttonIndex === 3) confirmDelete(p);
        }
      );
      return;
    }

    Alert.alert("Opciones", `${artistLabel} — ${resolveProjectTitle(p)}`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Renombrar…",
        onPress: () => {
          Alert.alert("Renombrar", `${artistLabel} — ${resolveProjectTitle(p)}`, [
            { text: "Cancelar", style: "cancel" },
            { text: "Renombrar artista", onPress: () => openRename(p, "artist") },
            { text: "Renombrar tema", onPress: () => openRename(p, "title") },
          ]);
        },
      },
      { text: "Borrar tema", style: "destructive", onPress: () => confirmDelete(p) },
    ]);
  }

  async function onTogglePending(id: string) {
    await togglePending(id);
    await refresh();
  }

  function confirmDeletePending(id: string, text: string) {
    Alert.alert("Borrar pendiente", `¿Quieres borrar “${text}”?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          await deletePending(id);
          await refresh();
        },
      },
    ]);
  }

  // ---------------- render ----------------

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.wrap}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onPullRefresh} />}
      >
        <View style={styles.logoWrap}>
          <Pressable onLongPress={openDevMenu} delayLongPress={450}>
            <Image
              source={require("../../assets/logo-oliworks.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </Pressable>

          <Pressable
            onPress={() => nav.navigate("DailyBriefing", { autoRunId: Date.now() })}
            style={styles.oliSmartIconBtn}
            hitSlop={12}
          >
            <Image
              source={require("../../assets/oliworks-super.png")}
              style={styles.oliSmartIcon}
              resizeMode="contain"
            />
          </Pressable>
        </View>

        <Card title="En Proceso">
          <View style={styles.headerRow}>
            <Pressable onPress={() => setOpenProjects((v) => !v)} style={styles.sectionToggle}>
              <Text style={styles.toggleText}>{openProjects ? "Ocultar" : "Mostrar"}</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
          </View>

          {openProjects ? (
            inProcessSorted.length === 0 ? (
              <Text style={styles.muted}>No hay temas en proceso. Usa “Add +”.</Text>
            ) : (
              groupedByArtist.map(({ artistKey, artistName, items: list }) => {
                const shouldCollapse = list.length > 2;
                const isOpen = (artistOpenMap[artistKey] ?? !shouldCollapse) as boolean;
                const note = artistNotesMap[artistKey] || "";

                return (
                  <View key={artistKey} style={{ marginTop: 6 }}>
                    <Pressable
                      onPress={() =>
                        setArtistOpenMap((prev) => ({
                          ...prev,
                          [artistKey]: !((prev[artistKey] ?? !shouldCollapse) as boolean),
                        }))
                      }
                      onLongPress={() => onArtistLongPress(artistKey, artistName, list.length)}
                      delayLongPress={350}
                      style={[styles.artistHeader, shouldCollapse && styles.artistHeaderCollapsible]}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <Text style={styles.artistHeaderText}>
                          {artistName} {shouldCollapse ? `(${list.length})` : ""}
                        </Text>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {note.trim() ? <Text style={styles.noteBadge}>📝</Text> : null}
                        <Text style={styles.artistHeaderCaret}>{isOpen ? "▾" : "▸"}</Text>
                      </View>
                    </Pressable>

                    {isOpen
                      ? list.map((p: any) => {
                          const title = resolveProjectTitle(p);
                          const dateLabel = resolveProjectDateLabel(p);

                          const pendingToRecord = getPendingInstruments(p as any, "musicians");
                          const showSuggestion = p.status !== "ARCHIVO" && pendingToRecord.length > 0;

                          return (
                            <Pressable
                              key={p.id}
                              onPress={() => nav.navigate("Details", { projectId: p.id } as any)}
                              style={styles.projCard}
                            >
                              <View style={styles.row}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.projTitle}>{title}</Text>

                                  <Text style={styles.projSub}>
                                    {dateLabel ? formatDateEs(dateLabel) : "Sin fecha"}
                                  </Text>

                                  {showSuggestion && (
                                    <Text
                                      style={{
                                        marginTop: 4,
                                        fontSize: 12,
                                        fontWeight: "800",
                                        opacity: 0.75,
                                      }}
                                    >
                                      🎙️ Grabar hoy: {pendingToRecord.join(", ")}
                                    </Text>
                                  )}
                                </View>

                                <Pressable
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    openDotsMenu(p);
                                  }}
                                  style={styles.dotsBtn}
                                >
                                  <Text style={styles.dots}>⋮</Text>
                                </Pressable>
                              </View>

                              <View style={{ marginTop: 10 }}>
                                <ProgressBar value={p.progress || 0} tone={"green"} />
                              </View>
                            </Pressable>
                          );
                        })
                      : null}
                  </View>
                );
              })
            )
          ) : (
            <Text style={styles.muted}>Toca “Mostrar” para ver la lista.</Text>
          )}
        </Card>

        <Card title="Agenda">
          <View style={styles.headerRow}>
            <Pressable onPress={() => setOpenAgenda((v) => !v)} style={styles.sectionToggle}>
              <Text style={styles.toggleText}>{openAgenda ? "Ocultar" : "Mostrar"}</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => (nav.getParent() as any)?.navigate("ExtraTab")}
              style={styles.abrirBtnWrap}
              hitSlop={12}
            >
              <Image source={require("../../assets/btn-abrir.png")} style={styles.abrirBtnImg} resizeMode="contain" />
            </Pressable>
          </View>

          {openAgenda ? (
            agendaUpcoming.length === 0 ? (
              <Text style={styles.muted}>Sin agenda.</Text>
            ) : (
              agendaUpcoming.slice(0, 6).map((a: any) => (
                <View key={a.id} style={styles.itemRow}>
                  <Text style={styles.itemText}>
                    {formatDateEs(a.dateLabel)} • {a.artist}
                    {a.note ? ` — ${a.note}` : ""}
                  </Text>
                </View>
              ))
            )
          ) : (
            <Text style={styles.muted}>Toca “Mostrar” para ver la agenda.</Text>
          )}
        </Card>

        <Card title="Pendientes">
          <View style={styles.headerRow}>
            <Pressable
              onPress={() => setOpenPend((v) => !v)}
              style={[styles.sectionToggle, { paddingVertical: 10 }]}
              hitSlop={12}
            >
              <Text style={styles.toggleText}>{openPend ? "Ocultar" : "Mostrar"}</Text>
            </Pressable>

            <View style={{ flex: 1 }} />

            <Pressable
              onPress={() => (nav.getParent() as any)?.navigate("ConfigTab", { screen: "Pendings" })}
              style={styles.abrirBtnWrap}
              hitSlop={12}
            >
              <Image source={require("../../assets/btn-abrir.png")} style={styles.abrirBtnImg} resizeMode="contain" />
            </Pressable>
          </View>

          {openPend ? (
            <>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 10 }}>
                <TextInput
                  value={pendingText}
                  onChangeText={setPendingText}
                  style={[styles.input, { flex: 1 }]}
                  placeholder="Escribe un pendiente…"
                />
                <PrimaryButton
                  label="Add"
                  onPress={async () => {
  const t = pendingText.trim();
  if (!t) return;

  await addPending(t);
  setPendingText("");
  await refresh(); // 🔥 ESTA ES LA CLAVE
}}
                />
              </View>

              {pendSorted.length === 0 ? (
                <Text style={styles.muted}>Sin pendientes.</Text>
              ) : (
                pendSorted.slice(0, 6).map((p: any) => (
                  <Pressable
                    key={p.id}
                    onPress={() => onTogglePending(p.id)}
                    onLongPress={() => confirmDeletePending(p.id, p.text)}
                    style={styles.itemRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.itemText,
                          p.done && { textDecorationLine: "line-through", opacity: 0.6 },
                        ]}
                      >
                        {p.text}
                      </Text>
                    </View>
                    <Text style={{ fontWeight: "900", opacity: p.done ? 0.5 : 0.85 }}>
                      {p.done ? "✓" : "•"}
                    </Text>
                  </Pressable>
                ))
              )}
            </>
          ) : (
            <Text style={styles.muted}>Toca “Mostrar” para ver los pendientes.</Text>
          )}
        </Card>

        <View style={{ height: 30 }} />
      </ScrollView>

      {/* DEV MODAL */}
      <Modal visible={devOpen} transparent animationType="fade" onRequestClose={() => setDevOpen(false)}>
        <Pressable style={styles.devOverlay} onPress={() => setDevOpen(false)}>
          <Pressable style={styles.devCard} onPress={() => {}}>
            <View style={styles.devHeaderRow}>
              <Text style={styles.devTitle}>Dev Panel</Text>
              <Pressable onPress={() => setDevOpen(false)} style={styles.devCloseBtn}>
                <Text style={styles.devCloseText}>✕</Text>
              </Pressable>
            </View>

            <Text style={styles.devSub}>Pruebas Supabase Edge Functions</Text>

            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ paddingTop: 10 }}>
              {devItems.map((it) => (
                <Pressable
                  key={it.key}
                  style={styles.devItem}
                  onPress={() => {
                    setDevOpen(false);
                    try {
                      it.run();
                    } catch (e: any) {
                      Alert.alert("Dev Panel", e?.message ?? String(e));
                    }
                  }}
                >
                  <Text style={styles.devItemText}>{it.label}</Text>
                  <Text style={styles.devItemChevron}>›</Text>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable style={styles.devCancel} onPress={() => setDevOpen(false)}>
              <Text style={styles.devCancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* RENAME MODAL */}
      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {renameMode === "title" ? "Renombrar tema" : "Renombrar artista"}
            </Text>

            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              placeholder={renameMode === "title" ? "Nuevo nombre del tema" : "Nuevo nombre del artista"}
              style={styles.modalInput}
            />

            <View style={styles.modalBtns}>
              <Pressable onPress={() => setRenameOpen(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable onPress={saveRename} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryText}>Guardar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 22, gap: 12 },

  noteBadge: {
    fontSize: 14,
    fontWeight: "900",
    opacity: 0.75,
  },

  logoWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginBottom: 10,
  },

  logo: {
    width: 240,
    height: 70,
    marginRight: 10,
  },

  oliSmartIconBtn: {
    width: 60,
    height: 60,
    backgroundColor: "transparent",
    borderWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },

  oliSmartIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
  },

  abrirBtnWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  abrirBtnImg: {
    width: 96,
    height: 36,
  },

  muted: { opacity: 0.65, marginTop: 6, fontWeight: "700" },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  sectionToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },

  toggleText: { fontWeight: "900", opacity: 0.75 },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  smallBtnText: { fontWeight: "900", opacity: 0.85 },

  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "600",
  },

  artistHeader: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.05)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  artistHeaderCollapsible: {},
  artistHeaderText: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0A58FF",
  },

  artistHeaderCaret: { fontWeight: "900", opacity: 0.6 },

  projCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
  },

  projTitle: { fontSize: 16, fontWeight: "900" },
  projSub: { opacity: 0.65, marginTop: 3, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  dotsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },

  dots: { fontSize: 18, fontWeight: "900", opacity: 0.8 },

  itemRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },

  itemText: { fontWeight: "700" },

  input: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(0,0,0,0.02)",
    fontWeight: "700",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },

  modalCard: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
  },

  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 10 },

  modalInput: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontWeight: "700",
  },

  modalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },

  modalBtnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.07)",
  },

  modalBtnGhostText: { fontWeight: "900", opacity: 0.85 },

  modalBtnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#1E88E5",
  },

  modalBtnPrimaryText: { fontWeight: "900", color: "#fff" },

  devOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  devCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 14,
  },
  devHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  devTitle: { fontSize: 18, fontWeight: "900" },
  devSub: { marginTop: 6, opacity: 0.7, fontWeight: "700" },

  devCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  devCloseText: { fontWeight: "900", opacity: 0.8, fontSize: 16 },

  devItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.04)",
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  devItemText: { fontWeight: "900", letterSpacing: 0.2 },
  devItemChevron: { fontSize: 22, fontWeight: "900", opacity: 0.35 },

  devCancel: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  devCancelText: { fontWeight: "900", opacity: 0.85 },
});
