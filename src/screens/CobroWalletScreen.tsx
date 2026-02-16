import React from "react";
import { View, Text, TextInput, Alert, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

// Ajusta la ruta según tu proyecto:
// si db.ts está en src/storage/db.ts
import { applySaldoLocal } from "../storage/db";

export default function CobroWalletScreen({ route }: any) {
  const nav = useNavigation<any>();

  const projectLocalId = String(route?.params?.projectLocalId ?? "").trim();
  const artistLocalId = String(route?.params?.artistLocalId ?? "").trim();

  const [applyAmount, setApplyAmount] = React.useState<string>("");
  const [note, setNote] = React.useState<string>("Aplicado a tema");
  const [loading, setLoading] = React.useState(false);

  const amountNumber = (() => {
    // acepta "1,200" o "1200" o "1200.50"
    const s = String(applyAmount || "").trim().replace(/,/g, "");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  })();

  async function onApplySaldo() {
    if (loading) return;

    if (!projectLocalId) return Alert.alert("Error", "No hay project_local_id");
    if (!artistLocalId) return Alert.alert("Error", "No hay artist_local_id");
    if (!amountNumber || amountNumber <= 0) return Alert.alert("Error", "Monto inválido");

    try {
      setLoading(true);

      await applySaldoLocal({
        projectLocalId,
        artistLocalId,
        amount: amountNumber,
        note: note?.trim() ? note.trim() : "Aplicado a tema",
        autoSync: true, // hace sync best-effort
      });

      Alert.alert("OK", "Saldo aplicado.");

      // Opcional: limpiar inputs
      setApplyAmount("");
      // nav.goBack(); // si quieres regresar automáticamente
    } catch (e: any) {
      console.log("[CobroWalletScreen] onApplySaldo error:", e);
      Alert.alert("Error", e?.message ?? "No se pudo aplicar el saldo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aplicar saldo</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Project</Text>
        <Text style={styles.value} numberOfLines={1}>{projectLocalId || "-"}</Text>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Artista</Text>
        <Text style={styles.value} numberOfLines={1}>{artistLocalId || "-"}</Text>
      </View>

      <Text style={[styles.label, { marginTop: 14 }]}>Monto</Text>
      <TextInput
        value={applyAmount}
        onChangeText={setApplyAmount}
        placeholder="Ej: 1500"
        keyboardType="numeric"
        style={styles.input}
      />

      <Text style={[styles.label, { marginTop: 14 }]}>Nota (opcional)</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Aplicado a tema"
        style={styles.input}
      />

      <Pressable
        onPress={onApplySaldo}
        disabled={loading}
        style={[styles.btn, loading ? styles.btnDisabled : null]}
      >
        <Text style={styles.btnText}>{loading ? "Aplicando..." : "APLICAR SALDO"}</Text>
      </Pressable>

      <Pressable onPress={() => nav.goBack()} style={styles.link}>
        <Text style={styles.linkText}>Volver</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, flex: 1 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 16 },
  row: { flexDirection: "row", gap: 10, marginBottom: 6, alignItems: "center" },
  label: { width: 70, opacity: 0.8, fontSize: 13 },
  value: { flex: 1, fontSize: 13, fontWeight: "600" },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: 6,
  },

  btn: {
    marginTop: 18,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111",
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "white", fontWeight: "700", fontSize: 16 },

  link: { marginTop: 16, alignItems: "center" },
  linkText: { opacity: 0.7, fontWeight: "600" },
});
