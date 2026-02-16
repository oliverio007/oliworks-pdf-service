// src/screens/PendingsScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import {
  addPending,
  deletePending, // soft delete
  loadPendings,
  syncPendings,
  togglePending,
  gcSoftDeleted,
  type PendingSyncItem,
} from "../storage/db";

import { Card, PrimaryButton } from "../ui/components";

type SyncState = "idle" | "syncing" | "ok" | "offline" | "error";

export default function PendingsScreen() {
  const [items, setItems] = useState<PendingSyncItem[]>([]);
  const [text, setText] = useState("");

  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [syncMsg, setSyncMsg] = useState<string>("");

  const syncingRef = useRef(false);

  async function refreshLocal() {
    const local = await loadPendings();
    setItems(local);
  }

  useEffect(() => {
    (async () => {
      await refreshLocal();
      // limpia soft-deletes viejos (opcional, silencioso)
      await gcSoftDeleted({ days: 21 }).catch(() => {});
      // auto-sync al arrancar
      await runSync("startup");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => items.filter((p) => !p.deletedAt), [items]);

  const sorted = useMemo(() => {
    // primero no-hechos, luego hechos
    return [...visible].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [visible]);

  const pendingCount = useMemo(() => items.filter((p) => !!p.pendingSync).length, [items]);

  async function add() {
    const t = text.trim();
    if (!t) return;

    const next = await addPending(t);
    setItems(next);
    setText("");

    setSyncState("idle");
    setSyncMsg("Pendiente de sync");

    await runSync("afterWrite");
  }

  function confirmDelete(id: string, label: string) {
    const go = async () => {
      const next = await deletePending(id); // soft delete
      setItems(next);

      setSyncState("idle");
      setSyncMsg("Pendiente de sync");

      await runSync("afterWrite");
    };

    if (Platform.OS === "web") {
      const ok = window.confirm(`¿Borrar pendiente “${label}”?`);
      if (!ok) return;
      go();
      return;
    }

    Alert.alert("Borrar", `¿Borrar pendiente “${label}”?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: go },
    ]);
  }

  async function onToggle(id: string) {
    const next = await togglePending(id);
    setItems(next);

    setSyncState("idle");
    setSyncMsg("Pendiente de sync");

    await runSync("afterWrite");
  }

  async function runSync(reason: "startup" | "manual" | "afterWrite" = "manual") {
    if (syncingRef.current) return;
    syncingRef.current = true;

    try {
      if (reason === "manual") {
        setSyncState("syncing");
        setSyncMsg("Sincronizando...");
      }

      const merged = await syncPendings();
      setItems(merged);

      const localNow = await loadPendings();
      const pendingNow = localNow.filter((x) => !!x.pendingSync).length;

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
      console.log("[PendingsScreen] sync error:", e);

      // no tires la UI: regresa a local
      await refreshLocal();
    } finally {
      syncingRef.current = false;
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Pendientes</Text>

      <Card title="Nuevo">
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          placeholder="Ej: Cobrar a X / Llamar a Y / Mandar demo..."
        />

        <View style={{ marginTop: 12 }}>
          <PrimaryButton label="Agregar" onPress={add} />
        </View>

        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => runSync("manual")}
            style={[styles.syncBtn, syncState === "syncing" && { opacity: 0.7 }]}
            disabled={syncState === "syncing"}
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

          <Text style={styles.syncStatus}>
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

      <Card title="Lista">
        {sorted.length === 0 ? (
          <Text style={{ opacity: 0.65 }}>Sin pendientes.</Text>
        ) : (
          sorted.map((p) => (
            <View key={p.id} style={styles.row}>
              <Pressable onPress={() => onToggle(p.id)} style={[styles.check, p.done && styles.checkOn]}>
                <Text style={[styles.checkTxt, p.done && { color: "white", opacity: 1 }]}>
                  {p.done ? "✓" : ""}
                </Text>
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTxt, p.done && { textDecorationLine: "line-through", opacity: 0.55 }]}>
                  {p.text}
                </Text>
                {!!p.pendingSync && <Text style={styles.pending}>Pendiente de sync</Text>}
              </View>

              <Pressable onPress={() => confirmDelete(p.id, p.text)} style={[styles.smallBtn, styles.smallBtnDanger]}>
                <Text style={styles.smallBtnTxt}>Borrar</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 18, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },

  input: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },

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

  check: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: "rgba(40,110,255,0.90)" },
  checkTxt: { fontWeight: "900", opacity: 0.75 },

  rowTxt: { fontWeight: "900", opacity: 0.85 },

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
});
