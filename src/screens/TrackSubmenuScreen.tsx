// src/screens/TrackSubmenuScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Card, PrimaryButton } from "../ui/components";
import {
  addTrackSectionItem,
  deleteTrackSectionItem,
  loadTrackSectionItems,
  toggleTrackSectionItem,
} from "../storage/db";

type Section = "MUSICIANS" | "TUNING" | "EDITION";

// ✅ Ajustado a lo que realmente devuelve db.ts (items dentro de la sección)
type Item = {
  id: string;
  text: string;
  done: boolean;
  pendingSync?: boolean;
  deletedAt?: string | null;
  createdAt?: number;
};

type RouteParams = {
  trackId: string;
  section: Section;
  title?: string;
};

export default function TrackSubmenuScreen({ route, navigation }: any) {
  const { trackId, section, title } = (route?.params || {}) as RouteParams;

  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");

  const [syncing, setSyncing] = useState(false);
  const writingRef = useRef(false);

  async function refresh() {
    try {
      if (!trackId || !section) return;
      const local = await loadTrackSectionItems(trackId, section);
      setItems((local || []).filter((x: any) => !x.deletedAt));
    } catch (e: any) {
      console.log("[TrackSubmenu] refresh error:", e);
      Alert.alert("Error", e?.message || "No se pudo cargar la lista.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, section]);

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [items]);

  async function add() {
    const t = text.trim();
    if (!t) return;
    if (writingRef.current) return;
    writingRef.current = true;

    try {
      setSyncing(true);
      await addTrackSectionItem(trackId, section, t);
      setText("");
      await refresh();
    } catch (e: any) {
      console.log("[TrackSubmenu] add error:", e);
      Alert.alert("Error", e?.message || "No se pudo agregar.");
    } finally {
      setSyncing(false);
      writingRef.current = false;
    }
  }

  async function onToggle(itemId: string) {
    try {
      setSyncing(true);
      // ✅ firma correcta: (trackId, section, itemId)
      await toggleTrackSectionItem(trackId, section, itemId);
      await refresh();
    } catch (e: any) {
      console.log("[TrackSubmenu] toggle error:", e);
      Alert.alert("Error", e?.message || "No se pudo actualizar.");
    } finally {
      setSyncing(false);
    }
  }

  function confirmDelete(itemId: string, label: string) {
    const go = async () => {
      try {
        setSyncing(true);
        // ✅ firma correcta: (trackId, section, itemId)
        await deleteTrackSectionItem(trackId, section, itemId); // soft delete
        await refresh();
      } catch (e: any) {
        console.log("[TrackSubmenu] delete error:", e);
        Alert.alert("Error", e?.message || "No se pudo borrar.");
      } finally {
        setSyncing(false);
      }
    };

    if (Platform.OS === "web") {
      // @ts-ignore
      const ok = window.confirm(`¿Borrar “${label}”?`);
      if (!ok) return;
      go();
      return;
    }

    Alert.alert("Borrar", `¿Borrar “${label}”?`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Borrar", style: "destructive", onPress: go },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title || "Sección"}</Text>

      <Card title="Agregar item">
        <TextInput
          value={text}
          onChangeText={setText}
          style={styles.input}
          placeholder="Ej: Tuba / Trompetas / Coros / Corrección X…"
          onSubmitEditing={add}
          returnKeyType="done"
        />

        <View style={{ marginTop: 12 }}>
          <PrimaryButton label={syncing ? "Guardando…" : "Agregar"} onPress={add} />
        </View>

        <View style={{ marginTop: 12 }}>
          <Pressable
            onPress={refresh}
            style={[styles.syncBtn, syncing && { opacity: 0.7 }]}
            disabled={syncing}
          >
            {syncing ? (
              <View style={styles.syncRow}>
                <ActivityIndicator />
                <Text style={styles.syncTxt}>Actualizando…</Text>
              </View>
            ) : (
              <Text style={styles.syncTxt}>Refrescar</Text>
            )}
          </Pressable>
        </View>
      </Card>

      <Card title="Lista">
        {sorted.length === 0 ? (
          <Text style={{ opacity: 0.65 }}>Sin items.</Text>
        ) : (
          sorted.map((p) => (
            <View key={p.id} style={styles.row}>
              <Pressable
                onPress={() => onToggle(p.id)}
                style={[styles.check, p.done && styles.checkOn]}
              >
                <Text style={[styles.checkTxt, p.done && { color: "white", opacity: 1 }]}>
                  {p.done ? "✓" : ""}
                </Text>
              </Pressable>

              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.rowTxt,
                    p.done && { textDecorationLine: "line-through", opacity: 0.55 },
                  ]}
                >
                  {p.text}
                </Text>
              </View>

              <Pressable
                onPress={() => confirmDelete(p.id, p.text)}
                style={[styles.smallBtn, styles.smallBtnDanger]}
              >
                <Text style={styles.smallBtnTxt}>Borrar</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>

      <View style={{ height: 18 }} />

      <PrimaryButton
        label="Regresar al detalle"
        onPress={() => {
          navigation.goBack();
        }}
      />

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
    fontWeight: "800",
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

  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  smallBtnDanger: { backgroundColor: "rgba(0,0,0,0.08)" },
  smallBtnTxt: { fontWeight: "900", opacity: 0.75 },
});
