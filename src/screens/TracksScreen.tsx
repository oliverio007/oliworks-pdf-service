// src/screens/TracksScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from "react-native";

import { Card, PrimaryButton } from "../ui/components";
import { addTrack, loadTracksByProject } from "../storage/db";

type Track = {
  id: string;
  projectId: string;
  title: string;
  progress?: number; // 0-100
  deletedAt?: string | null;
};

type RouteParams = {
  projectId: string;
  projectTitle?: string;
};

export default function TracksScreen({ route, navigation }: any) {
  const { projectId, projectTitle } = (route?.params || {}) as RouteParams;

  const [items, setItems] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  const [addVisible, setAddVisible] = useState(false);
  const [title, setTitle] = useState("");

  const writingRef = useRef(false);

  async function refresh() {
    setLoading(true);
    try {
      const local = await loadTracksByProject(projectId);
      setItems(local || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const visible = useMemo(() => items.filter((t) => !t.deletedAt), [items]);

  async function onAdd() {
    const t = title.trim();
    if (!t) {
      Alert.alert("Atención", "Ponle un nombre al track.");
      return;
    }
    if (writingRef.current) return;
    writingRef.current = true;

    try {
      await addTrack(projectId, t);
      setTitle("");
      setAddVisible(false);
      await refresh();
    } catch (e: any) {
      console.log("[Tracks] addTrack error:", e);
      Alert.alert("Error", e?.message || "No se pudo agregar el track.");
    } finally {
      writingRef.current = false;
    }
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>
          Tracks{projectTitle ? ` — ${projectTitle}` : ""}
        </Text>

        <Card title="Acciones">
          <Text style={styles.muted}>
            Lista de canciones/temas dentro de este proyecto.
          </Text>

          <PrimaryButton
            label="Agregar track"
            onPress={() => {
              setTitle("");
              setAddVisible(true);
            }}
          />
        </Card>

        <Card title={`Lista (${visible.length})`}>
          {loading ? (
            <Text style={{ opacity: 0.7, fontWeight: "800" }}>Cargando…</Text>
          ) : visible.length === 0 ? (
            <Text style={{ opacity: 0.65 }}>Sin tracks todavía.</Text>
          ) : (
            visible.map((t) => (
              <Pressable
                key={t.id}
                style={styles.row}
                onPress={() =>
                  navigation.navigate("TrackDetail", {
                    trackId: t.id,
                    projectId,
                    projectTitle,
                  })
                }
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t.title}</Text>
                  <Text style={styles.rowSub}>
                    Progreso: {typeof t.progress === "number" ? `${t.progress}%` : "—"}
                  </Text>
                </View>

                <Text style={styles.chev}>›</Text>
              </Pressable>
            ))
          )}
        </Card>

        <View style={{ height: 26 }} />
      </ScrollView>

      {/* MODAL: Agregar Track */}
      <Modal
        visible={addVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Agregar track</Text>
            <Text style={styles.muted}>Ej: “Corrido 01”, “Tema para X”, etc.</Text>

            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Nombre del track"
              style={styles.input}
              autoFocus
              onSubmitEditing={onAdd}
              returnKeyType="done"
            />

            <View style={styles.modalBtns}>
              <Pressable
                onPress={() => setAddVisible(false)}
                style={styles.modalBtnGhost}
              >
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable onPress={onAdd} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryText}>Agregar</Text>
              </Pressable>
            </View>

            {Platform.OS !== "web" ? null : (
              <Text style={{ marginTop: 10, opacity: 0.6, fontWeight: "800" }}>
                Tip: Enter para guardar.
              </Text>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 18, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },
  muted: { opacity: 0.75, marginBottom: 10, fontWeight: "700" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.08)",
  },
  rowTitle: { fontWeight: "900", opacity: 0.9, fontSize: 16 },
  rowSub: { marginTop: 4, fontWeight: "900", opacity: 0.55 },

  chev: { fontWeight: "900", opacity: 0.35, fontSize: 22 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 520,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", marginBottom: 6 },

  input: {
    marginTop: 8,
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    fontWeight: "800",
  },

  modalBtns: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 12,
  },
  modalBtnGhost: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.07)",
  },
  modalBtnGhostText: { fontWeight: "900", opacity: 0.8 },
  modalBtnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#1E88E5",
  },
  modalBtnPrimaryText: { fontWeight: "900", color: "#fff" },
});
