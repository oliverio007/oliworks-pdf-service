import React, { useEffect, useMemo, useState } from "react";
import {
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  View,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { BANDA_DEFAULT_ON, GRUPO_DEFAULT_ON } from "../data/instruments";

import { useIsFocused, useRoute } from "@react-navigation/native";
import {
  getProject,
  upsertProject,
  computeProgress,
  computeStatus,
} from "../storage/db";
import { Project } from "../types";
import { Card, ProgressBar } from "../ui/components";

type Route = {
  key: string;
  name: string;
  params: { projectId: string; section: "MUSICOS" | "EDICION" | "AFINACION" };
};

function allDone(map: Record<string, boolean>) {
  const keys = Object.keys(map || {});
  if (keys.length === 0) return false;
  return keys.every((k) => !!map[k]);
}

export default function InstrumentSectionScreen() {
  const route = useRoute<Route>();
  const isFocused = useIsFocused();
  const { projectId, section } = route.params;

  const [p, setP] = useState<Project | null>(null);
  const [newInstrument, setNewInstrument] = useState("");

  const mapKey = useMemo(() => {
    if (section === "MUSICOS") return "musiciansDone" as const;
    if (section === "EDICION") return "editionDone" as const;
    return "tuningDone" as const;
  }, [section]);

  function recomputeChecklist(next: Project) {
    return {
      ...(next.checklist || {}),
      MUSICOS: allDone(next.musiciansDone || {}),
      EDICION: allDone(next.editionDone || {}),
      AFINACION: allDone(next.tuningDone || {}),
    } as any;
  }

  useEffect(() => {
    if (!isFocused) return;

    (async () => {
      const proj = await getProject(projectId);
      if (!proj) {
        setP(null);
        return;
      }

      const instrumentationType =
        proj.instrumentationType ||
        (proj as any).instrumentation_type;

      if (
        Array.isArray(proj.instruments) &&
        proj.instruments.length === 0 &&
        (instrumentationType === "BANDA" ||
          instrumentationType === "GRUPO")
      ) {
        const preset =
          instrumentationType === "BANDA"
            ? BANDA_DEFAULT_ON
            : GRUPO_DEFAULT_ON;

        const baseMap = Object.fromEntries(
          preset.map((i) => [i, false])
        ) as Record<string, boolean>;

        const patched: Project = {
          ...proj,
          instrumentationType,
          instruments: preset,
          musiciansDone: { ...baseMap },
          editionDone: { ...baseMap },
          tuningDone: { ...baseMap },
          updatedAt: Date.now(),
        };

        patched.checklist = recomputeChecklist(patched);
        patched.progress = computeProgress(patched);
        patched.status = computeStatus(patched);

        setP(patched);
        upsertProject(patched);
        return;
      }

      setP(proj);
    })();
  }, [projectId, isFocused]);

  async function toggle(name: string) {
    if (!p) return;

    // Jerarquía mínima
    if (section === "EDICION" && !p.musiciansDone?.[name]) {
      Alert.alert("Primero graba el músico");
      return;
    }

    if (section === "AFINACION" && !p.musiciansDone?.[name]) {
      Alert.alert("Primero graba el músico");
      return;
    }

    const next: Project = { ...p, updatedAt: Date.now() };

    const currentMap = (p as any)[mapKey] || {};
    const map = { ...currentMap };
    map[name] = !map[name];

    (next as any)[mapKey] = map;

    // 🔥 Cascadas de coherencia

    // Si desmarcas grabación → limpia edición y afinación
    if (section === "MUSICOS" && map[name] === false) {
      next.editionDone = { ...(p.editionDone || {}), [name]: false };
      next.tuningDone = { ...(p.tuningDone || {}), [name]: false };
    }

    // Si desmarcas edición → limpia afinación
    if (section === "EDICION" && map[name] === false) {
      next.tuningDone = { ...(p.tuningDone || {}), [name]: false };
    }

    next.checklist = recomputeChecklist(next);
    next.progress = computeProgress(next);
    next.status = computeStatus(next);

    setP(next);
    upsertProject(next);
  }

  async function applyPreset(group: "BANDA" | "GRUPO") {
    if (!p) return;

    const preset =
      group === "BANDA"
        ? BANDA_DEFAULT_ON
        : GRUPO_DEFAULT_ON;

    const baseMap = Object.fromEntries(
      preset.map((i) => [i, false])
    ) as Record<string, boolean>;

    const next: Project = {
      ...p,
      instrumentationType: group,
      instruments: preset,
      musiciansDone: { ...baseMap },
      editionDone: { ...baseMap },
      tuningDone: { ...baseMap },
      updatedAt: Date.now(),
    };

    next.checklist = recomputeChecklist(next);
    next.progress = computeProgress(next);
    next.status = computeStatus(next);

    setP(next);
    upsertProject(next);
  }

  function removeInstrument(name: string) {
    if (!p) return;

    Alert.alert(
      "Eliminar instrumento",
      `¿Seguro que quieres eliminar "${name}"?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: async () => {
            const instruments = (p.instruments || []).filter(
              (i) => i !== name
            );

            const musiciansDone = { ...(p.musiciansDone || {}) };
            const editionDone = { ...(p.editionDone || {}) };
            const tuningDone = { ...(p.tuningDone || {}) };

            delete musiciansDone[name];
            delete editionDone[name];
            delete tuningDone[name];

            const next: Project = {
              ...p,
              instruments,
              musiciansDone,
              editionDone,
              tuningDone,
              updatedAt: Date.now(),
            };

            next.checklist = recomputeChecklist(next);
            next.progress = computeProgress(next);
            next.status = computeStatus(next);

            setP(next);
            upsertProject(next);
          },
        },
      ]
    );
  }

  async function addInstrument() {
    if (!p) return;

    const name = newInstrument.trim().toUpperCase();
    if (!name) return;

    if ((p.instruments || []).includes(name)) {
      Alert.alert("Instrumento ya agregado");
      return;
    }

    const instruments = [...(p.instruments || []), name];

    const next: Project = {
      ...p,
      instruments,
      musiciansDone: { ...(p.musiciansDone || {}), [name]: false },
      editionDone: { ...(p.editionDone || {}), [name]: false },
      tuningDone: { ...(p.tuningDone || {}), [name]: false },
      updatedAt: Date.now(),
    };

    next.checklist = recomputeChecklist(next);
    next.progress = computeProgress(next);
    next.status = computeStatus(next);

    setP(next);
    upsertProject(next);
    setNewInstrument("");
  }

  if (!p)
    return (
      <View style={styles.center}>
        <Text style={{ fontWeight: "900" }}>Cargando…</Text>
      </View>
    );

  const items = p.instruments || [];
  const doneMap = ((p as any)[mapKey] || {}) as Record<string, boolean>;

  const headerTitle =
    section === "MUSICOS"
      ? "Músicos"
      : section === "EDICION"
      ? "Edición"
      : "Afinación";

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.projectHeader}>
        <Text style={styles.projectTitle}>{p.title}</Text>
        {p.artist ? (
          <Text style={styles.projectArtist}>{p.artist}</Text>
        ) : null}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.title}>{headerTitle}</Text>
      </View>

      <Card title="Progreso">
        <ProgressBar value={p.progress || 0} />
      </Card>

      <Card title="Instrumentos">
        {items.map((name) => {
          const on = !!doneMap[name];
          return (
            <View key={name} style={[styles.row, on && styles.rowOn]}>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => toggle(name)}
              >
                <Text style={[styles.name, on && styles.nameOn]}>
                  {name}
                </Text>
              </Pressable>

              <Text style={styles.check}>{on ? "✓" : ""}</Text>

              <Pressable
                onPress={() => removeInstrument(name)}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteText}>✕</Text>
              </Pressable>
            </View>
          );
        })}
      </Card>

      <Card title="Agregar instrumento">
        <View style={styles.addRow}>
          <TextInput
            placeholder="Ej. Acordeon"
            value={newInstrument}
            onChangeText={setNewInstrument}
            style={styles.input}
          />
          <Pressable onPress={addInstrument} style={styles.addButton}>
            <Text style={styles.addText}>Agregar</Text>
          </Pressable>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16 },
  title: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 1,
    opacity: 0.6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.1)",
  },
  projectHeader: { marginBottom: 5 },
  projectTitle: {
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: "#111",
  },
  projectArtist: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 6,
    color: "#111",
  },
  addRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  addButton: {
    backgroundColor: "#2e7dff",
    paddingHorizontal: 14,
    justifyContent: "center",
    borderRadius: 8,
  },
  addText: { color: "#fff", fontWeight: "900" },
  sectionHeader: { alignItems: "flex-end", marginBottom: 16 },
  deleteBtn: { paddingHorizontal: 10, justifyContent: "center" },
  deleteText: { color: "red", fontWeight: "900", fontSize: 16 },
  rowOn: { backgroundColor: "rgba(40,170,80,0.12)" },
  name: { fontWeight: "800" },
  nameOn: { opacity: 1 },
  check: { fontWeight: "900" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
