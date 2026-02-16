// src/screens/AgendaScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  View,
  Pressable,
  Alert,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";

import {
  uid,
  loadAgenda,
  upsertAgendaItem,
  deleteAgendaItem,
  formatDateEs,
  todayLabel,
  syncAgenda,
} from "../storage/db";

import { AgendaItem } from "../types";
import { Card, PrimaryButton } from "../ui/components";

// ---------------- helpers calendario ----------------

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function toYMD(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fromYMD(s: string) {
  const [y, m, d] = (s || "").split("-").map((x) => Number(x));
  return new Date(y || 2000, (m || 1) - 1, d || 1);
}
function isValidYMD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
// Lunes=0 ... Domingo=6
function mondayIndex(jsDay: number) {
  // JS: 0=Dom ... 6=Sab
  return (jsDay + 6) % 7;
}

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type CalProps = {
  selectedYMD: string;
  onSelect: (ymd: string) => void;
};

function MonthCalendar({ selectedYMD, onSelect }: CalProps) {
  const initial = isValidYMD(selectedYMD)
    ? fromYMD(selectedYMD)
    : fromYMD(todayLabel());
  const [cursor, setCursor] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1)
  );

  const sel = useMemo(
    () => (isValidYMD(selectedYMD) ? fromYMD(selectedYMD) : null),
    [selectedYMD]
  );

  const meta = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth(); // 0..11
    const first = new Date(year, month, 1);
    const firstIdx = mondayIndex(first.getDay()); // 0..6
    const dim = daysInMonth(year, month);

    // grid 6x7 (42 celdas)
    const cells: Array<{ day: number | null; ymd: string | null }> = [];
    for (let i = 0; i < 42; i++) {
      const dayNum = i - firstIdx + 1;
      if (dayNum < 1 || dayNum > dim) {
        cells.push({ day: null, ymd: null });
      } else {
        const ymd = `${year}-${pad2(month + 1)}-${pad2(dayNum)}`;
        cells.push({ day: dayNum, ymd });
      }
    }
    return { year, month, cells };
  }, [cursor]);

  function prevMonth() {
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  return (
    <View style={calStyles.box}>
      <View style={calStyles.header}>
        <Pressable onPress={prevMonth} style={calStyles.navBtn}>
          <Text style={calStyles.navTxt}>‹</Text>
        </Pressable>

        <Text style={calStyles.headerTitle}>
          {MONTHS_ES[meta.month]} {meta.year}
        </Text>

        <Pressable onPress={nextMonth} style={calStyles.navBtn}>
          <Text style={calStyles.navTxt}>›</Text>
        </Pressable>
      </View>

      <View style={calStyles.weekRow}>
        {WEEKDAYS_ES.map((w) => (
          <Text key={w} style={calStyles.weekTxt}>
            {w}
          </Text>
        ))}
      </View>

      <View style={calStyles.grid}>
        {meta.cells.map((c, idx) => {
          const isSelected = !!(c.ymd && c.ymd === selectedYMD);
          const isToday = c.ymd === todayLabel();
          return (
            <Pressable
              key={idx}
              onPress={() => c.ymd && onSelect(c.ymd)}
              disabled={!c.ymd}
              style={[
                calStyles.cell,
                isSelected && calStyles.cellSelected,
                isToday && calStyles.cellToday,
              ]}
            >
              <Text
                style={[
                  calStyles.dayTxt,
                  !c.ymd && { opacity: 0.25 },
                  isSelected && calStyles.dayTxtSelected,
                ]}
              >
                {c.day ?? ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {sel && (
        <Text style={calStyles.preview}>{formatDateEs(toYMD(sel))}</Text>
      )}
    </View>
  );
}

const calStyles = StyleSheet.create({
  box: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(255,255,255,0.85)",
    padding: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerTitle: { fontWeight: "900", fontSize: 14, opacity: 0.85 },
  navBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  navTxt: { fontWeight: "900", fontSize: 16, opacity: 0.75 },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  weekTxt: {
    width: "14.2857%",
    textAlign: "center",
    fontWeight: "900",
    opacity: 0.55,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: "14.2857%",
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginVertical: 2,
  },
  cellToday: { backgroundColor: "rgba(0,0,0,0.04)" },
  cellSelected: { backgroundColor: "rgba(40,110,255,0.90)" },
  dayTxt: { fontWeight: "900", opacity: 0.85 },
  dayTxtSelected: { color: "white", opacity: 1 },
  preview: {
    marginTop: 10,
    fontWeight: "900",
    opacity: 0.7,
    textAlign: "center",
  },
});

// ---------------- screen ----------------

type SyncState = "idle" | "syncing" | "ok" | "offline" | "error";

export default function AgendaScreen() {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [dateLabel, setDateLabel] = useState(todayLabel());
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMsg, setSyncMsg] = useState<string>("");

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDateLabel, setEditDateLabel] = useState(todayLabel());
  const [editArtist, setEditArtist] = useState("");
  const [editNote, setEditNote] = useState("");

  // evita dobles sync al iniciar / spameo
  const syncingRef = useRef(false);

  // evita doble tap en Agregar / Guardar (y nos sirve para bloquear UI)
  const writingRef = useRef(false);
  const [writing, setWriting] = useState(false);

  async function refreshLocal() {
    const local = await loadAgenda();
    setItems(local);
  }

  useEffect(() => {
    (async () => {
      await refreshLocal();
      // auto-sync al arrancar (silencioso)
      await runSync("startup");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => {
    // no mostrar soft-deleted en la lista
    return items.filter((x: any) => !(x as any).deletedAt);
  }, [items]);

  const sorted = useMemo(() => {
    return [...visible].sort((a: any, b: any) => {
      if (a.dateLabel !== b.dateLabel) return a.dateLabel > b.dateLabel ? 1 : -1;
      return (a.artist || "").localeCompare(b.artist || "");
    });
  }, [visible]);

  const pendingCount = useMemo(() => {
    return items.filter((x: any) => !!(x as any).pendingSync).length;
  }, [items]);

  const artistSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const a = String((sorted[i] as any).artist || "").trim();
      if (!a) continue;
      const k = a.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(a);
      if (out.length >= 8) break;
    }
    return out;
  }, [sorted]);

  async function add() {
    if (writingRef.current) return; // evita doble tap
    writingRef.current = true;
    setWriting(true);

    try {
      if (!dateLabel.trim() || !artist.trim()) {
        Alert.alert("Falta info", "Fecha y Artista son requeridos.");
        return;
      }
      if (!isValidYMD(dateLabel.trim())) {
        Alert.alert("Fecha inválida", "Selecciona la fecha en el calendario.");
        return;
      }

      // ✅ Anti-duplicado local (misma fecha + artista + nota)
      // ✅ Solo bloquea duplicado EXACTO cuando hay nota (o sea, cuando realmente es el mismo evento)
// Si no hay nota, permite múltiples eventos el mismo día para el mismo artista.
// ✅ Anti-duplicado: SOLO bloquea si es un duplicado exacto Y trae nota
// (si note está vacía, permite múltiples eventos mismo día mismo artista)
const sig = `${dateLabel.trim()}|${artist.trim()}|${(note.trim() || "").trim()}`.toLowerCase();

const existsExact = items.some((x: any) => {
  if ((x as any).deletedAt) return false;
  const xsig = `${(x as any).dateLabel}|${(x as any).artist}|${((x as any).note || "").trim()}`.toLowerCase();
  return xsig === sig;
});

if (existsExact && note.trim()) {
  Alert.alert("Ya existe", "Ese evento ya está registrado.");
  return;
}



      const it: AgendaItem = {
  id: uid(),
  dateLabel: dateLabel.trim(),
  artist: artist.trim(),
  note: note.trim() || undefined,
};


      const next = await upsertAgendaItem(it);
      setItems(next);

      setArtist("");
      setNote("");

      // mensaje inmediato (sin mentir “Sync OK”)
      setSyncState("idle");
      setSyncMsg("Pendiente de sync");

      // auto-sync después de escribir (no bloquea si no hay internet)
      await runSync("afterWrite");
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }

  function confirmDelete(id: string, label: string) {
    const go = async () => {
      // evita doble tap en borrar
      if (writingRef.current) return;
      writingRef.current = true;
      setWriting(true);

      try {
        const next = await deleteAgendaItem(id);
        setItems(next);

        setSyncState("idle");
        setSyncMsg("Pendiente de sync");

        await runSync("afterWrite");
      } finally {
        writingRef.current = false;
        setWriting(false);
      }
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(`¿Borrar agenda de “${label}”?`);
      if (!ok) return;
      go();
      return;
    }

    Alert.alert("Borrar", `¿Borrar agenda de “${label}”?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: go },
    ]);
  }

  function openEdit(item: any) {
    setEditId(item.id);
    setEditDateLabel(item.dateLabel);
    setEditArtist(item.artist);
    setEditNote(item.note || "");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!editId) return;

    if (writingRef.current) return;
    writingRef.current = true;
    setWriting(true);

    try {
      if (!editDateLabel.trim() || !editArtist.trim()) {
        Alert.alert("Falta info", "Fecha y Artista son requeridos.");
        return;
      }
      if (!isValidYMD(editDateLabel.trim())) {
        Alert.alert("Fecha inválida", "Selecciona la fecha en el calendario.");
        return;
      }

      const current: any = items.find((x: any) => x.id === editId);
      if (!current) {
        setEditOpen(false);
        return;
      }

      const patch: AgendaItem = {
        ...current,
        dateLabel: editDateLabel.trim(),
        artist: editArtist.trim(),
        note: editNote.trim() || undefined,

        pendingSync: true as any,
        localUpdatedAt: Date.now() as any,
      };

      const next = await upsertAgendaItem(patch);
      setItems(next);
      setEditOpen(false);

      setSyncState("idle");
      setSyncMsg("Pendiente de sync");

      await runSync("afterWrite");
    } finally {
      writingRef.current = false;
      setWriting(false);
    }
  }

  async function runSync(reason: "startup" | "manual" | "afterWrite" = "manual") {
    const fn = (syncAgenda as any) as undefined | (() => Promise<any[] | void>);
    if (!fn) {
      setSyncState("error");
      setSyncMsg("syncAgenda no está implementado en db.ts");
      return;
    }

    // evita doble sync simultáneo
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      // En startup/afterWrite: no pongas “Sincronizando...” ruidoso
      if (reason === "manual") {
        setSyncState("syncing");
        setSyncMsg("Sincronizando...");
      }

      const res = await fn();

      if (Array.isArray(res)) {
        setItems(res); // <-- merged
      } else {
        await refreshLocal();
      }

      // Si aún quedan pendientes (por ejemplo, offline), no digas “OK”
      const localNow = await loadAgenda();
      const pendingNow = localNow.filter((x: any) => !!(x as any).pendingSync).length;

      if (pendingNow > 0) {
        setSyncState("offline");
        setSyncMsg("Sin internet (modo offline)");
      } else {
        setSyncState("ok");
        setSyncMsg("Sync OK");
      }
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      const lower = msg.toLowerCase();

      const isOffline =
        lower.includes("network") ||
        lower.includes("failed to fetch") ||
        lower.includes("offline") ||
        lower.includes("enotfound") ||
        lower.includes("timeout") ||
        lower.includes("fetch") ||
        lower.includes("socket");

      setSyncState(isOffline ? "offline" : "error");
      setSyncMsg(isOffline ? "Sin internet (modo offline)" : `Error de sync: ${msg}`);
      console.log("[AgendaScreen] sync error:", e);
    } finally {
      syncingRef.current = false;
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Agenda</Text>

      <Card title="Nuevo">
        <MonthCalendar selectedYMD={dateLabel} onSelect={setDateLabel} />

        <Text style={styles.label}>Artista</Text>

        {artistSuggestions.length > 0 && (
          <View style={styles.chipsRow}>
            {artistSuggestions.map((a) => (
              <Pressable
                key={a}
                style={[styles.chip, writing && { opacity: 0.7 }]}
                onPress={() => !writing && setArtist(a)}
                disabled={writing}
              >
                <Text style={styles.chipTxt}>{a}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <TextInput
          value={artist}
          onChangeText={setArtist}
          style={styles.input}
          placeholder="Ej: Banda El Recodo"
          editable={!writing}
        />

        <Text style={styles.label}>Nota</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={styles.input}
          placeholder="Opcional"
          editable={!writing}
        />

        <View style={{ marginTop: 12 }}>
          <PrimaryButton label={writing ? "Guardando..." : "Agregar"} onPress={add} />
        </View>

        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => runSync("manual")}
            style={[
              styles.syncBtn,
              (syncState === "syncing" || writing) && { opacity: 0.7 },
            ]}
            disabled={syncState === "syncing" || writing}
          >
            {syncState === "syncing" ? (
              <View style={styles.syncRow}>
                <ActivityIndicator />
                <Text style={styles.syncTxt}>Sincronizando…</Text>
              </View>
            ) : (
              <Text style={styles.syncTxt}>Sincronizar ahora</Text>
            )}
          </Pressable>

          <Text
            style={[
              styles.syncStatus,
              syncState === "ok" && { opacity: 0.8 },
              syncState === "offline" && { opacity: 0.9 },
              syncState === "error" && { opacity: 0.95 },
            ]}
          >
            {syncMsg
              ? pendingCount > 0
                ? `${syncMsg} — ${pendingCount} pendiente(s)`
                : syncMsg
              : pendingCount > 0
              ? `Pendiente de sync — ${pendingCount} pendiente(s)`
              : "—"}
          </Text>
        </View>
      </Card>

      <Card title="Próximos">
        {sorted.length === 0 ? (
          <Text style={{ opacity: 0.65 }}>Sin agenda.</Text>
        ) : (
          sorted.map((a: any) => (
            <View key={a.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <View style={styles.rowTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>
                      {(a.artist || "—").slice(0, 3).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{a.artist}</Text>
                    <Text style={styles.rowSub}>
                      {formatDateEs(a.dateLabel)}
                      {a.note ? ` — ${a.note}` : ""}
                    </Text>

                    {!!a.pendingSync && (
                      <Text style={styles.pending}>Pendiente de sync</Text>
                    )}
                  </View>
                </View>
              </View>

              <Pressable
                onPress={() => !writing && openEdit(a)}
                disabled={writing}
                style={[styles.smallBtn, writing && { opacity: 0.7 }]}
              >
                <Text style={styles.smallBtnTxt}>Editar</Text>
              </Pressable>

              <Pressable
                onPress={() => !writing && confirmDelete(a.id, a.artist)}
                disabled={writing}
                style={[
                  styles.smallBtn,
                  styles.smallBtnDanger,
                  writing && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.smallBtnTxt}>Borrar</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <View style={{ height: 30 }} />

      {/* ---------- EDIT MODAL ---------- */}
      <Modal visible={editOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Editar agenda</Text>

            <Text style={styles.label}>Fecha</Text>
            <MonthCalendar selectedYMD={editDateLabel} onSelect={setEditDateLabel} />

            <Text style={styles.label}>Artista</Text>
            <TextInput
              value={editArtist}
              onChangeText={setEditArtist}
              style={styles.input}
              placeholder="Ej: Banda El Recodo"
              editable={!writing}
            />

            <Text style={styles.label}>Nota</Text>
            <TextInput
              value={editNote}
              onChangeText={setEditNote}
              style={styles.input}
              placeholder="Opcional"
              editable={!writing}
            />

            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setEditOpen(false)}
                disabled={writing}
                style={[styles.modalBtn, styles.modalBtnGhost, writing && { opacity: 0.7 }]}
              >
                <Text style={styles.modalBtnTxt}>Cancelar</Text>
              </Pressable>

              <Pressable
                onPress={saveEdit}
                disabled={writing}
                style={[styles.modalBtn, styles.modalBtnPrimary, writing && { opacity: 0.7 }]}
              >
                <Text style={[styles.modalBtnTxt, { color: "white" }]}>
                  {writing ? "Guardando..." : "Guardar"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 18, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },

  label: { fontWeight: "900", marginTop: 10, marginBottom: 6, opacity: 0.9 },

  input: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },

  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  chipTxt: { fontWeight: "900", opacity: 0.75 },

  syncBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  syncTxt: { fontWeight: "900", opacity: 0.75, fontSize: 16 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  syncStatus: { marginTop: 8, fontWeight: "900", opacity: 0.7 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowTitle: { fontWeight: "900" },
  rowSub: { opacity: 0.7, marginTop: 3 },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontWeight: "900", opacity: 0.75 },

  pending: {
    marginTop: 6,
    fontWeight: "900",
    opacity: 0.55,
  },

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  smallBtnDanger: {
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  smallBtnTxt: { fontWeight: "900", opacity: 0.75 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", marginBottom: 6 },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 14 },
  modalBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnGhost: { backgroundColor: "rgba(0,0,0,0.06)" },
  modalBtnPrimary: { backgroundColor: "rgba(40,110,255,0.90)" },
  modalBtnTxt: { fontWeight: "900", opacity: 0.85 },
});
