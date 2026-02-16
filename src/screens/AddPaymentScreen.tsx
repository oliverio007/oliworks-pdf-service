import React, { useEffect, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  View,
  ActivityIndicator,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AddStackParamList } from "../../App";
import { getDraft, updateDraft, deleteDraft } from "../storage/db";
import { supabase } from "../lib/supabase";
import { Card, PrimaryButton, SecondaryButton } from "../ui/components";

type Nav = NativeStackNavigationProp<AddStackParamList>;
type Route = { key: string; name: string; params: { draftId: string } };

export default function AddPaymentScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { draftId } = route.params;

  const [draft, setDraft] = useState<any>(null);
  const [totalCost, setTotalCost] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  // =========================
  // LOAD DRAFT
  // =========================
  useEffect(() => {
    (async () => {
      const d = await getDraft(draftId);
      if (!d) {
        Alert.alert("Error", "No se encontró el borrador");
        nav.goBack();
        return;
      }

      setDraft(d);
      setTotalCost(d.totalCost ? String(d.totalCost) : "");
      setBooting(false);
    })();
  }, [draftId]);

  // =========================
  // SAVE PROJECT
  // =========================
 const handleSave = async () => {
  console.log("DRAFT COMPLETO:", draft);
console.log("artistLocalId:", draft?.artistLocalId);
console.log("artistId:", draft?.artistId);

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) throw new Error("Usuario no autenticado");

    // 🔥 1️⃣ Buscar el artista por local_id
    const { data: artist, error: artistError } = await supabase
  .from("artists")
  .select("id, local_id")
  .eq("local_id", draft.artistLocalId)
  .eq("user_id", user?.id) // 🔥 MUY IMPORTANTE
  .is("deleted_at", null)
  .single();


    if (artistError || !artist) {
      throw new Error("El artista no existe");
    }

    // 🔥 2️⃣ Insertar proyecto correctamente
    const { error } = await supabase.from("projects").insert({
      user_id: user.id,
      local_id: draft.localId,
      artist_local_id: draft.artistLocalId,
      artist_id: artist.id, // 🔥 ESTA ES LA CLAVE
      title: draft.title,
      progress: draft.progress,
      status: draft.status,
      total_cost: draft.payment?.cost ?? 0,
      paid_in_full: draft.payment?.paidInFull ?? false,
      amount_paid: 0,
      instrumentation_type: draft.instrumentation_type,
      data: draft, // JSON completo
    });

    if (error) throw error;

    Alert.alert("Éxito", "Proyecto guardado correctamente");
  } catch (err: any) {
    Alert.alert("Error", err.message);
  }
};




  if (booting) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10, opacity: 0.6 }}>
          Cargando borrador…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Cobro</Text>

      <Card title="Resumen del tema">
        <Text style={styles.info}>Artista: {draft?.artistName}</Text>
        <Text style={styles.info}>Tema: {draft?.title}</Text>
        <Text style={styles.info}>Instrumentos: {draft?.instruments?.length || 0}</Text>
      </Card>

      <Card title="Costo">
        <Text style={styles.label}>Costo total (opcional)</Text>

        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder="0"
          value={totalCost}
          onChangeText={setTotalCost}
        />
      </Card>

      <View style={styles.actions}>
        <SecondaryButton label="Atrás" onPress={() => nav.goBack()} />

        <PrimaryButton
          label={loading ? "Guardando..." : "Guardar tema"}
          onPress={handleSave}
          disabled={loading}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    paddingTop: 22,
    gap: 14,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    fontSize: 16,
  },
  info: {
    fontSize: 13,
    opacity: 0.85,
    marginTop: 4,
  },
  actions: {
    marginTop: 10,
    gap: 10,
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
