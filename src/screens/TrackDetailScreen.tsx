// src/screens/TrackDetailScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Card, PrimaryButton } from "../ui/components";

import { getTrack, toggleTrackChecklist, loadTrackSectionItems } from "../storage/db";

type Section = "MUSICIANS" | "TUNING" | "EDITION";

type TrackChecklistItem = {
  id: string;
  text: string;
  done: boolean;
  deletedAt?: string | null;
};

type Track = {
  id: string;
  projectId: string;
  title: string;
  progress?: number; // 0-100
  general?: TrackChecklistItem[];
  deletedAt?: string | null;
};

type TrackSectionItem = TrackChecklistItem;

const TRACK_CHECKLIST_KEYS = ["GUIA", "ARREGLO", "VOZ", "MIX", "MASTER"] as const;

function pct(n: number) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function ProgressBar({ value }: { value: number }) {
  const v = pct(value);
  return (
    <View style={pb.wrap}>
      <View style={[pb.fill, { width: `${v}%` }]} />
      <Text style={pb.txt}>{v}%</Text>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap: {
    height: 18,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.08)",
    overflow: "hidden",
    justifyContent: "center",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(40,110,255,0.90)",
  },
  txt: {
    textAlign: "center",
    fontWeight: "900",
    fontSize: 12,
    color: "rgba(0,0,0,0.75)",
  },
});

export default function TrackDetailScreen({ route, navigation }: any) {
  const { trackId } = route?.params || {};

  const [track, setTrack] = useState<Track | null>(null);
  const [mus, setMus] = useState<TrackSectionItem[]>([]);
  const [tun, setTun] = useState<TrackSectionItem[]>([]);
  const [edi, setEdi] = useState<TrackSectionItem[]>([]);

  const loadingRef = useRef(false);

  async function refresh() {
    if (!trackId) return;
    if (loadingRef.current) return;
    loadingRef.current = true;

    try {
      const t = await getTrack(trackId);
      if (!t) {
        setTrack(null);
        return;
      }
      setTrack(t);

      const [m, a, e] = await Promise.all([
        loadTrackSectionItems(trackId, "MUSICIANS"),
        loadTrackSectionItems(trackId, "TUNING"),
        loadTrackSectionItems(trackId, "EDITION"),
      ]);

      setMus((m || []).filter((x: any) => !x?.deletedAt));
      setTun((a || []).filter((x: any) => !x?.deletedAt));
      setEdi((e || []).filter((x: any) => !x?.deletedAt));
    } catch (err: any) {
      console.log("[TrackDetail] refresh error:", err);
      Alert.alert("Error", err?.message || "No se pudo cargar el track.");
    } finally {
      loadingRef.current = false;
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

  // ✅ checklistMap desde track.general[]
  const checklistMap = useMemo(() => {
    const items = (track?.general || []).filter((x) => !x?.deletedAt);
    const map: Record<string, boolean> = {};
    for (const k of TRACK_CHECKLIST_KEYS) {
      map[k] = items.some(
        (i) => String(i?.text ?? "").trim().toUpperCase() === k && !!i?.done
      );
    }
    return map;
  }, [track]);

  const sectionSummary = useMemo(() => {
    const summarize = (items: TrackSectionItem[]) => {
      if (!items || items.length === 0) return { state: "vacío", done: false, missing: false };
      const hasMissing = items.some((x) => !x.done);
      return { state: hasMissing ? "faltan" : "completo", done: !hasMissing, missing: hasMissing };
    };
    return {
      musicians: summarize(mus),
      tuning: summarize(tun),
      edition: summarize(edi),
    };
  }, [mus, tun, edi]);

  const computedProgress = useMemo(() => {
    // ✅ Misma idea: checklist general 40% + secciones 60% (20% c/u)
    const totalKeys = TRACK_CHECKLIST_KEYS.length;
    const doneKeys = TRACK_CHECKLIST_KEYS.filter((k) => !!checklistMap[k]).length;
    const checklistPct = totalKeys ? (doneKeys / totalKeys) * 100 : 0;

    const secPct = (s: { done: boolean; missing: boolean; state: string }) =>
      s.state === "vacío" ? 0 : s.done ? 100 : 50; // “faltan” = 50

    const avg =
      checklistPct * 0.4 +
      secPct(sectionSummary.musicians) * 0.2 +
      secPct(sectionSummary.tuning) * 0.2 +
      secPct(sectionSummary.edition) * 0.2;

    return pct(avg);
  }, [checklistMap, sectionSummary]);

  const progressToShow =
    typeof track?.progress === "number" ? pct(track.progress) : computedProgress;

  async function toggleKey(key: string) {
    try {
      await toggleTrackChecklist(trackId, key);
      await refresh();
    } catch (e: any) {
      console.log("[TrackDetail] toggleTrackChecklist error:", e);
      Alert.alert("Error", e?.message || "No se pudo actualizar checklist.");
    }
  }

  function goSection(section: Section, title: string) {
    navigation.navigate("TrackSubmenu", {
      trackId,
      section,
      title,
    });
  }

  if (!track) {
    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Track</Text>
        <Text style={{ opacity: 0.7, fontWeight: "800" }}>Cargando…</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{track.title}</Text>

      <Card title="Progreso">
        <Text style={styles.muted}>
          Usamos la misma lógica de avance (barra). Esto es lo que luego ChatGPT puede leer para contestar:
          “¿Cómo vamos con X canción?”
        </Text>

        <ProgressBar value={progressToShow} />
      </Card>

      <Card title="Checklist general">
        {TRACK_CHECKLIST_KEYS.map((k) => {
          const on = !!checklistMap?.[k];
          return (
            <Pressable key={k} style={styles.checkRow} onPress={() => toggleKey(k)}>
              <View style={[styles.checkBox, on && styles.checkBoxOn]}>
                <Text style={[styles.checkMark, on && { color: "white", opacity: 1 }]}>
                  {on ? "✓" : ""}
                </Text>
              </View>
              <Text style={styles.checkTxt}>{k}</Text>
            </Pressable>
          );
        })}
      </Card>

      <Card title="Resumen por secciones">
        <Pressable style={styles.secRow} onPress={() => goSection("MUSICIANS", "Músicos")}>
          <View style={{ flex: 1 }}>
            <Text style={styles.secTitle}>Músicos</Text>
            <Text style={styles.secSub}>
              {sectionSummary.musicians.state === "vacío"
                ? "Sin items"
                : sectionSummary.musicians.missing
                ? "Faltan músicos"
                : "Completo"}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable style={styles.secRow} onPress={() => goSection("TUNING", "Afinación")}>
          <View style={{ flex: 1 }}>
            <Text style={styles.secTitle}>Afinación</Text>
            <Text style={styles.secSub}>
              {sectionSummary.tuning.state === "vacío"
                ? "Sin items"
                : sectionSummary.tuning.missing
                ? "Falta afinación"
                : "Completa"}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>

        <Pressable style={styles.secRow} onPress={() => goSection("EDITION", "Edición")}>
          <View style={{ flex: 1 }}>
            <Text style={styles.secTitle}>Edición</Text>
            <Text style={styles.secSub}>
              {sectionSummary.edition.state === "vacío"
                ? "Sin items"
                : sectionSummary.edition.missing
                ? "Falta edición"
                : "Completa"}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      </Card>

      <View style={{ height: 30 }} />
      <PrimaryButton label="Refrescar" onPress={refresh} />
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 18, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },
  muted: { opacity: 0.75, marginBottom: 10, fontWeight: "700" },

  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  checkBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: "rgba(40,110,255,0.90)" },
  checkMark: { fontWeight: "900", opacity: 0.75 },
  checkTxt: { fontWeight: "900", opacity: 0.85, fontSize: 15 },

  secRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  secTitle: { fontWeight: "900", opacity: 0.9, fontSize: 16 },
  secSub: { marginTop: 4, fontWeight: "900", opacity: 0.55 },
  chev: { fontWeight: "900", opacity: 0.35, fontSize: 22 },
});
