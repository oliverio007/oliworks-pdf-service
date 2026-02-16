// src/screens/ConfigScreen.tsx
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useBiometric } from "../lib/biometricContext";
import { supabase } from "../lib/supabase";
import { ConfigStackParamList } from "../../App";
import { Card, PrimaryButton } from "../ui/components";

import { importBackupJson, createBackupFile, syncAll } from "../storage/db";

type Nav = NativeStackNavigationProp<ConfigStackParamList>;

export default function ConfigScreen() {
  const nav = useNavigation<Nav>();
  const { biometricEnabled, setBiometricEnabled } = useBiometric();
  const bioOn = biometricEnabled ?? false;

  const [importVisible, setImportVisible] = useState(false);
  const [importText, setImportText] = useState("");

  // 🔹 EXPORTAR BACKUP COMO ARCHIVO .JSON
  async function handleExportBackup() {
    try {
      const uri = await createBackupFile();
      console.log("Backup creado en:", uri);

      if (Platform.OS === "web") {
        Alert.alert(
          "Backup creado",
          "El backup se generó correctamente.\n\n" +
            "En la versión web no se puede descargar el archivo directamente, " +
            "pero este mismo backup se podrá exportar como archivo desde tu celular " +
            "usando Expo Go o la app instalada."
        );
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(
          "Backup creado",
          `El backup se guardó en:\n${uri}\n\nEn este dispositivo no está disponible el menú de compartir.`
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/json",
        dialogTitle: "Compartir backup de OliWorks",
      });
    } catch (e: any) {
      console.error("Error exportando backup:", e);
      Alert.alert("Error", e?.message || "No se pudo crear o compartir el archivo de backup.");
    }
  }

  // 🔹 IMPORTAR BACKUP DESDE ARCHIVO .JSON
  async function handleImportBackupFromFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/json",
        copyToCacheDirectory: true,
      });

      if ((res as any).canceled || (res as any).type === "cancel") return;

      let uri: string | undefined;

      if ("assets" in res && res.assets && res.assets.length > 0) {
        uri = res.assets[0].uri;
      } else if ("uri" in res && typeof (res as any).uri === "string") {
        uri = (res as any).uri;
      }

      if (!uri) {
        Alert.alert("Error", "No se pudo obtener la ruta del archivo seleccionado.");
        return;
      }

      const json = await FileSystem.readAsStringAsync(uri, { encoding: "utf8" });

      await importBackupJson(json);
      Alert.alert("Listo", "Backup importado correctamente desde el archivo.");
    } catch (e: any) {
      console.error("Error importando backup desde archivo:", e);
      Alert.alert("Error al importar", e?.message || "Revisa que el archivo .json sea un backup válido.");
    }
  }

  // 🔹 IMPORTAR BACKUP PEGANDO JSON
  async function handleImportBackupFromText() {
    try {
      if (!importText.trim()) {
        Alert.alert("Atención", "Pega primero el contenido del backup.");
        return;
      }

      await importBackupJson(importText.trim());
      setImportVisible(false);
      Alert.alert("Listo", "Backup importado correctamente.");
    } catch (e: any) {
      Alert.alert("Error al importar", e?.message || "Revisa que el JSON sea un backup válido.");
    }
  }

  async function handleSyncAll() {
    try {
      const r = await syncAll({ gcDays: 21 });

      const errs = Object.entries(r.errors)
        .filter(([, v]) => !!v)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n");

      Alert.alert(
        "Sincronizar TODO",
        `Listo.\n\n` +
          `Projects: ${r.projects.length}\n` +
          `Agenda (events): ${r.agenda.length}\n` +
          `Pendings: ${r.pendings.length}\n` +
          `ArtistProfiles: ${r.artistProfiles.length}\n` +
          `Wallet: ${r.wallet.length}\n\n` +
          (errs ? `Errores:\n${errs}` : "Sin errores.")
      );
    } catch (e: any) {
      console.log("[Config] syncAll error:", e);
      Alert.alert("Error", e?.message || "No se pudo sincronizar todo.");
    }
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Configuración</Text>

        {/* ARCHIVO */}
        <Card title="Archivo">
          <Text style={styles.muted}>Versiones (V1/V2…) + exportar PDF/Excel + restaurar copia.</Text>
          <PrimaryButton label="Abrir Archivo" onPress={() => nav.navigate("Archive")} />
        </Card>

        {/* PENDIENTES */}
        <Card title="Pendientes">
          <Text style={styles.muted}>Captura pendientes rápidos del día y márcalos como hechos.</Text>
          <PrimaryButton label="Abrir Pendientes" onPress={() => nav.navigate("Pendings")} />
        </Card>

        {/* SEGURIDAD / BIOMÉTRICO */}
        <Card title="Seguridad">
          <Text style={styles.muted}>
            Si activas huella, al abrir la app (con sesión iniciada) te pedirá biometría para entrar.
          </Text>

          <Pressable
            onPress={() => setBiometricEnabled(!bioOn)}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 12,
              backgroundColor: bioOn ? "#1E88E5" : "rgba(0,0,0,0.08)",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontWeight: "900",
                color: bioOn ? "#fff" : "rgba(0,0,0,0.8)",
              }}
            >
              {bioOn ? "Huella: ACTIVADA" : "Huella: DESACTIVADA"}
            </Text>
          </Pressable>
        </Card>

        {/* BACKUP */}
        <Card title="Backup">
          <Text style={styles.muted}>
            Exporta / importa toda la info (En proceso, Archivo, Agenda y Pendientes) en un solo archivo JSON.
          </Text>

          <PrimaryButton label="Exportar backup" onPress={handleExportBackup} />
          <View style={{ height: 8 }} />
          <PrimaryButton label="Importar backup (.json)" onPress={handleImportBackupFromFile} />
          <View style={{ height: 8 }} />
          <PrimaryButton
            label="Importar pegando texto"
            onPress={() => {
              setImportText("");
              setImportVisible(true);
            }}
          />
        </Card>

        {/* SINCRONIZAR TODO */}
        <Card title="Sincronizar con la nube">
          <Text style={styles.muted}>
            Un solo botón: empuja y jala Projects + Agenda(events) + Pendings + ArtistProfiles + Wallet.
          </Text>

          <PrimaryButton label="Sincronizar TODO" onPress={handleSyncAll} />
        </Card>

        {/* CUENTA */}
        <Card title="Cuenta">
          <Text style={styles.muted}>Cierra sesión en este dispositivo.</Text>

          <PrimaryButton
            label="Cerrar sesión"
            onPress={async () => {
              await supabase.auth.signOut();
            }}
          />
        </Card>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* MODAL IMPORT (PEGAR JSON) */}
      <Modal
        visible={importVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImportVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Importar backup</Text>
            <Text style={styles.muted}>
              Pega aquí el contenido del archivo JSON de backup. Esto reemplazará la información actual de
              proyectos, archivo, agenda y pendientes.
            </Text>

            <TextInput
              value={importText}
              onChangeText={setImportText}
              multiline
              placeholder="{ ... }"
              style={styles.modalInput}
            />

            <View style={styles.modalBtns}>
              <Pressable onPress={() => setImportVisible(false)} style={styles.modalBtnGhost}>
                <Text style={styles.modalBtnGhostText}>Cancelar</Text>
              </Pressable>

              <Pressable onPress={handleImportBackupFromText} style={styles.modalBtnPrimary}>
                <Text style={styles.modalBtnPrimaryText}>Importar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 22, gap: 10 },
  title: { fontSize: 20, fontWeight: "900", marginBottom: 4 },
  muted: { opacity: 0.75, marginBottom: 10, fontWeight: "700" },

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
  modalTitle: {
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  modalInput: {
    marginTop: 10,
    minHeight: 160,
    maxHeight: 320,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
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
  modalBtnGhostText: {
    fontWeight: "900",
    opacity: 0.8,
  },
  modalBtnPrimary: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#1E88E5",
  },
  modalBtnPrimaryText: {
    fontWeight: "900",
    color: "#fff",
  },
});
