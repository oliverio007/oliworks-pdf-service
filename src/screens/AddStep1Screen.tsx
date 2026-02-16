// src/screens/AddStep1Screen.tsx
import React, { useCallback, useState } from "react";
import {
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  View,
  Platform,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { supabase } from "../lib/supabase"; // o donde lo tengas
import { normalizeArtistName } from "../utils/text";




import { AddStackParamList } from "../../App";
import { BANDA_DEFAULT_ON, GRUPO_DEFAULT_ON } from "../data/instruments";
import {
  createDraft,
  updateDraft,
  upsertProject,
  computeProgress,
  computeStatus,
    loadArtistProfiles,
  normalizeArtistLocalId,
  resolveArtistKeyFromInput,
  getArtistProfileByKey,
  upsertArtistProfile,
} from "../storage/db";
import {
  InstrumentGroupType,
  Project,
  CHECKLIST_KEYS,
  ChecklistKey,
} from "../types";
import { Card, PrimaryButton } from "../ui/components";

type Nav = NativeStackNavigationProp<AddStackParamList>;

function getPreset(g: InstrumentGroupType) {
  if (g === "BANDA") return BANDA_DEFAULT_ON;
  if (g === "GRUPO") return GRUPO_DEFAULT_ON;
  return [];
}

// Helpers
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayLabel() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function emptyChecklist() {
  const obj: Record<ChecklistKey, boolean> = {} as any;
  CHECKLIST_KEYS.forEach((k) => {
    obj[k] = false;
  });
  return obj;
}

type ImageSource = "camera" | "library";

type OcrResult = {
  titles?: string[];
  title?: string;
  group?: InstrumentGroupType;
  rawText?: string;
};

// ✅ Cloud Run URL
const OCR_BASE_URL = "https://oli-ocr-backend-45573886060.us-central1.run.app";
const RECENT_ARTISTS_KEY = "oliworks_recent_artists_v1";

// OCR (solo TEMAS)
async function callOcrApi(imageBase64: string): Promise<OcrResult> {
  console.log("Llamando OCR backend...", `${OCR_BASE_URL}/ocr`);

  const resp = await fetch(`${OCR_BASE_URL}/ocr`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, mode: "TRACKS" }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.log("Respuesta OCR NO OK:", resp.status, text);
    throw new Error(text || `HTTP ${resp.status}`);
  }

  const data = await resp.json();
  console.log("Respuesta OCR OK:", data);

  return {
    title: data.title,
    titles: data.titles,
    group: data.group as InstrumentGroupType | undefined,
    rawText: data.rawText,
  };
}

function buildStageMaps(instruments: string[]) {
  const base: Record<string, boolean> = {};
  instruments.forEach((i) => {
    base[i] = false;
  });

  return {
    musiciansDone: { ...base },
    editionDone: { ...base },
    tuningDone: { ...base },
  };
}


// Artistas recientes
async function loadRecentArtists(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_ARTISTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function addRecentArtist(name: string) {
  const n = name.trim();
  if (!n) return;
  try {
    const list = await loadRecentArtists();
    const filtered = list.filter(
      (a) => a.trim().toLowerCase() !== n.toLowerCase()
    );
    const next = [n, ...filtered].slice(0, 10); // máx 10
    await AsyncStorage.setItem(RECENT_ARTISTS_KEY, JSON.stringify(next));
  } catch {
    // silencio
  }
}

export default function AddStep1Screen() {
  const nav = useNavigation<Nav>();
  const [draftId, setDraftId] = useState<string | null>(null);

  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState<InstrumentGroupType>("OTROS");

  // Temas detectados por OCR
  const [titleChoices, setTitleChoices] = useState<string[]>([]);
  const [titleChoicesSelected, setTitleChoicesSelected] = useState<
    Record<string, boolean>
  >({});
  const [showTitleChecklist, setShowTitleChecklist] = useState(false);

  // Artistas recientes
  const [recentArtists, setRecentArtists] = useState<string[]>([]);
  const [showRecentArtists, setShowRecentArtists] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;

      (async () => {
        setArtist("");
        setTitle("");
        setGroup("OTROS");
        setDraftId(null);

        setShowTitleChecklist(false);
        setTitleChoices([]);
        setTitleChoicesSelected({});

        const id = await createDraft();
        if (alive) setDraftId(id);

        const recents = await loadRecentArtists();
        if (alive) setRecentArtists(recents);
      })();

      return () => {
        alive = false;
      };
    }, [])
  );

  async function selectGroup(g: InstrumentGroupType) {
  setGroup(g);
  if (!draftId) return;

  const preset = getPreset(g);
  const stageMaps = buildStageMaps(preset);

  await updateDraft(draftId, {
  group: g,
  instruments: preset,
  ...stageMaps,
} as Partial<Project>);

}


 async function next() {
  if (!draftId) return;

  const artistNameRaw = artist.trim();
const artistName = normalizeArtistName(artistNameRaw);

  const titleName = title.trim();

  if (!artistName || !titleName) {
    Alert.alert("Falta info", "Escribe Artista y Tema.");
    return;
  }

  // 🔥 OBTENER USUARIO AQUÍ
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
  Alert.alert("Error", "Usuario no autenticado");
  return;
}

console.log("USER ID:", user.id);

// 🔥 clave canónica
const artistKey = await resolveArtistKeyFromInput(artistName);

console.log("artistName:", artistName);
console.log("artistKey:", artistKey);

// 🔥 Buscar artista en Supabase
const { data: existingArtist, error: artistError } = await supabase
  .from("artists")
  .select("id, local_id")
  .eq("local_id", artistKey)
  .eq("user_id", user.id)
  .is("deleted_at", null)
  .maybeSingle();

if (artistError) {
  console.log("artistError:", artistError);
  throw artistError;
}

let artistId = existingArtist?.id;

console.log("existingArtist:", existingArtist);

// 🔥 Si no existe, lo creamos
if (!existingArtist) {
  const { data: newArtist, error: insertError } = await supabase
    .from("artists")
    .insert({
      user_id: user.id,
      name: artistName,
      local_id: artistKey,
    })
    .select("id")
    .single();

  if (insertError) {
    console.log("insertError:", insertError);
    throw insertError;
  }

  artistId = newArtist.id;
}

console.log("FINAL artistId:", artistId);

const preset = getPreset(group);
const safePreset = preset.length ? preset : [];

const stageMaps = buildStageMaps(safePreset);


await updateDraft(draftId, {
  artist: artistName,
  title: titleName,
  group,
  instruments: preset,
  ...stageMaps,
  ...(artistKey ? ({ artistLocalId: artistKey } as any) : {}),
});


await addRecentArtist(artistName);

nav.navigate("AddInstruments", { draftId });

}


  const pill = (label: string, on: boolean, onPress: () => void) => (
    <Pressable onPress={onPress} style={[styles.pill, on && styles.pillOn]}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </Pressable>
  );

  // Cámara
  function handlePhotoPress() {
    if (!artist.trim()) {
      Alert.alert(
        "Falta artista",
        "Falta seleccionar artista (escribe uno o elige de la lista)."
      );
      return;
    }
    if (!group) {
      Alert.alert(
        "Falta instrumentación",
        "Falta elegir instrumentación (Banda / Grupo / Otros) antes de tomar la foto."
      );
      return;
    }

    Alert.alert(
      "¿De dónde tomar la imagen?",
      "",
      [
        { text: "Tomar foto", onPress: () => handleImportFromPhoto("camera") },
        { text: "Galería", onPress: () => handleImportFromPhoto("library") },
        { text: "Cancelar", style: "cancel" },
      ],
      { cancelable: true }
    );
  }

  async function handleImportFromPhoto(source: ImageSource) {
    try {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (perm.status !== "granted") {
        Alert.alert(
          "Permiso requerido",
          "Necesito acceso a la cámara/galería para leer los datos."
        );
        return;
      }

      const res =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({
              base64: true,
              quality: 0.7,
            });

      if (res.canceled) return;

      const asset = res.assets?.[0];
      if (!asset || !asset.base64) {
        Alert.alert("Sin imagen", "No se pudo obtener la imagen seleccionada.");
        return;
      }

      const ocr = await callOcrApi(asset.base64);

      const list = (ocr.titles || (ocr.title ? [ocr.title] : []))
        .map((s) => s?.trim())
        .filter(Boolean) as string[];

      if (!list.length) {
        Alert.alert("Sin datos", "No se detectaron títulos de temas en la imagen.");
        return;
      }

      if (list.length === 1) {
        setTitle(list[0].trim());
        return;
      }

      const initialSelected: Record<string, boolean> = {};
      list.forEach((t) => (initialSelected[t] = false));

      setTitleChoices(list);
      setTitleChoicesSelected(initialSelected);
      setShowTitleChecklist(true);
    } catch (e: any) {
      console.error("Error OCR:", e);
      Alert.alert(
        "Error",
        "No se pudo analizar la foto. Revisa tu conexión o el servidor OCR."
      );
    }
  }

  function toggleTitleChoice(name: string) {
    setTitleChoicesSelected((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  }

   async function applySelectedTitles() {
  const selected = titleChoices.filter((t) => titleChoicesSelected[t]);

  if (selected.length === 0) {
    Alert.alert("Nada seleccionado", "Marca al menos un tema para continuar.");
    return;
  }

  const artistNameRaw = artist.trim();
const artistName = normalizeArtistName(artistNameRaw);

  if (!artistName) {
    Alert.alert(
      "Falta artista",
      "Falta seleccionar artista antes de crear los temas."
    );
    return;
  }

 const artistKey = await resolveArtistKeyFromInput(artistName);


  // ✅ asegura perfil (artist_profiles) para que Home muestre displayName correcto
  // OJO: NO resetea note/advance si ya existe
  if (artistKey) {
    try {
      const profiles = await loadArtistProfiles();
const exists = profiles.find((p: any) => {
  const k = normalizeArtistLocalId(String(p?.artistKey ?? p?.artist_key ?? ""));
  const del = p?.deletedAt ?? p?.deleted_at;
  return k === artistKey && !del;
});


if (!exists) {
  // si no existe: créalo
  await upsertArtistProfile({
    artistKey,
    displayName: artistName,
    note: "",
    advanceTotal: 0,
  } as any);
} else {
  // si existe: SOLO actualiza displayName si cambió
  const cur = String(exists.displayName || "").trim();
  if (cur !== artistName) {
    await upsertArtistProfile({
      artistKey,
      displayName: artistName,
    } as any);
  }
}

    } catch (e) {
      console.log("[AddStep1] ensure artist profile failed (non-blocking):", e);
    }
  }

  const preset = getPreset(group);
  const now = Date.now();
  const date = todayLabel();

  for (const t of selected) {
    const titleName = String(t || "").trim();
    if (!titleName) continue;

   
const stageMaps = buildStageMaps(preset);

const baseProject: Project = {
  id: uid(),
  createdAt: now,
  updatedAt: now,
  dateLabel: date,
  artist: artistName,
  title: titleName,
  group,
  instruments: preset,

  musiciansDone: stageMaps.musiciansDone,
  editionDone: stageMaps.editionDone,
  tuningDone: stageMaps.tuningDone,

  checklist: emptyChecklist(),
  payment: { total: 0, advances: [], paidInFull: false },
  progress: 0,
  status: "EN_PROCESO",
  notes: undefined,

  ...(artistKey ? ({ artistLocalId: artistKey } as any) : {}),
} as any;


    baseProject.progress = computeProgress(baseProject);
    baseProject.status = computeStatus(baseProject);

    await upsertProject(baseProject as any);
  }

  await addRecentArtist(artistName);

  Alert.alert(
    "Temas agregados",
    `Se agregaron ${selected.length} tema(s) al artista "${artistName}" en "En Proceso".`,
    [
      {
        text: "OK",
        onPress: () => {
          setShowTitleChecklist(false);
          setTitleChoices([]);
          setTitleChoicesSelected({});
          setTitle("");

          nav.getParent()?.navigate("HomeTab" as never);
        },
      },
    ]
  );
}



  function cancelTitleChecklist() {
    setShowTitleChecklist(false);
    setTitleChoices([]);
    setTitleChoicesSelected({});
  }

  function handleSelectRecentArtist(name: string) {
    setArtist(name);
    setShowRecentArtists(false);
    if (draftId) {
      updateDraft(draftId, { artist: name }).catch(() => {});
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Add +</Text>

      {/* Datos */}
      <Card title="Datos">
        {/* Instrumentación arriba */}
        <View style={styles.temaRow}>
          
          <View style={styles.inlineGroupRow}>
            {pill("Banda", group === "BANDA", () => selectGroup("BANDA"))}
            {pill("Grupo", group === "GRUPO", () => selectGroup("GRUPO"))}
            {pill("Otros", group === "OTROS", () => selectGroup("OTROS"))}
          </View>
        </View>

        {/* Artista */}
        <Text style={styles.label}>Artista</Text>
        <View style={styles.artistRow}>
          <TextInput
            value={artist}
            onChangeText={setArtist}
            style={[styles.input, styles.artistInput]}
            placeholder="Ej: Banda El Recodo"
          />
          <Pressable
            style={styles.artistPickerBtn}
            onPress={() => setShowRecentArtists((v) => !v)}
          >
            <Text style={styles.artistPickerIcon}>⌄</Text>
          </Pressable>
        </View>

        {showRecentArtists && recentArtists.length > 0 && (
          <View style={styles.recentList}>
            {recentArtists.map((a) => (
              <Pressable
                key={a}
                onPress={() => handleSelectRecentArtist(a)}
                style={styles.recentItem}
              >
                <Text style={styles.recentItemText}>{a}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Tema */}
        <Text style={styles.label}>Tema</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          style={styles.input}
          placeholder="Ej: Mi Hora de Brillar"
        />

        {/* Cámara hasta abajo */}
        <View style={styles.photoRow}>
          <Pressable
            onPress={
              Platform.OS === "web"
                ? () =>
                    Alert.alert(
                      "Solo en celular",
                      "La función de leer datos desde foto está disponible en la app móvil (Android/iOS)."
                    )
                : handlePhotoPress
            }
            style={styles.camButton}
          >
            <Text style={styles.camIcon}>📷</Text>
          </Pressable>
          <Text style={styles.photoHint}>
            Detecta temas desde foto y agrégalos al artista seleccionado.
          </Text>
        </View>

        <View style={{ marginTop: 14 }}>
          <PrimaryButton label="Next" onPress={next} />
        </View>
      </Card>

      {/* Checklist de TEMAS detectados */}
      {showTitleChecklist && (
        <Card title="Temas detectados">
          <Text style={styles.checklistHint}>
            Marca los temas que quieres agregar al artista seleccionado. Se
            crearán proyectos en &quot;En Proceso&quot; usando la misma
            instrumentación.
          </Text>

          {titleChoices.map((name) => {
            const on = !!titleChoicesSelected[name];
            return (
              <Pressable
                key={name}
                onPress={() => toggleTitleChoice(name)}
                style={styles.row}
              >
                <View style={[styles.checkBox, on && styles.checkBoxOn]}>
                  {on && <Text style={styles.checkMark}>✓</Text>}
                </View>
                <Text style={styles.rowText}>{name}</Text>
              </Pressable>
            );
          })}

          <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
            <PrimaryButton
              label="Usar seleccionados"
              onPress={applySelectedTitles}
            />
            <PrimaryButton
              label="Cancelar"
              tone="gray"
              onPress={cancelTitleChecklist}
            />
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 22, gap: 8 },
  title: { fontSize: 22, fontWeight: "900" },

  label: {
    fontWeight: "900",
    marginTop: 10,
    marginBottom: 6,
    opacity: 0.9,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },

  // Artista + flecha
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  artistInput: { flex: 1 },
  artistPickerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  artistPickerIcon: {
    fontSize: 16,
    fontWeight: "900",
    opacity: 0.8,
  },
  recentList: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(255,255,255,0.98)",
    overflow: "hidden",
  },
  recentItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  recentItemText: { fontWeight: "800", opacity: 0.9 },

  // ✅ Instrumentación (BOTONES MÁS GRANDES)
  temaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    marginBottom: 10,
  },
  inlineGroupRow: {
    flexDirection: "row",
    gap: 10,
    flexShrink: 1,
    flexWrap: "wrap",
    marginLeft: 8,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    minHeight: 42,
    minWidth: 90,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.06)",
    justifyContent: "center",
    alignItems: "center",
  },
  pillOn: { backgroundColor: "rgba(40,170,80,0.25)" },
  pillText: {
    fontWeight: "900",
    opacity: 0.75,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  pillTextOn: { opacity: 1 },

  // Cámara
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  camButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  camIcon: { fontSize: 20 },
  photoHint: {
    fontSize: 12,
    opacity: 0.7,
    fontWeight: "700",
    flex: 1,
  },

  // Checklist de títulos
  checklistHint: {
    fontSize: 12,
    opacity: 0.8,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    gap: 8,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: {
    backgroundColor: "rgba(30,136,229,0.95)",
    borderColor: "rgba(30,136,229,1)",
  },
  checkMark: { color: "white", fontWeight: "900", fontSize: 14 },
  rowText: { flex: 1, fontSize: 13, fontWeight: "800", opacity: 0.9 },
});
