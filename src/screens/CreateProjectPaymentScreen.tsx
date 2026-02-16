import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { PrimaryButton } from "../ui/components";
import { supabase } from "../lib/supabase";

type Props = {
  artistLocalId: string;
  title: string;
  instrumentationType: "BANDA" | "GRUPO" | "OTROS";
  instruments: string[];
  onBack?: () => void;
  onSaved?: () => void;
};

const CreateProjectPaymentScreen: React.FC<Props> = ({
  artistLocalId,
  title,
  instrumentationType,
  instruments,
  onBack,
  onSaved,
}) => {
  const [totalCost, setTotalCost] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    try {
      setLoading(true);

      const parsedCost = parseFloat(totalCost) || 0;

      const { error } = await supabase.from("projects").insert({
        title,
        artist_local_id: artistLocalId,
        instrumentation_type: instrumentationType,
        instruments,
        total_cost: parsedCost,
        status: "EN_PROCESO",
        progress: 0,
      });

      if (error) throw error;

      Alert.alert("Éxito", "Tema creado correctamente");
      onSaved?.();
    } catch (err: any) {
      Alert.alert("Error", err.message || "No se pudo guardar el tema");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Costo del proyecto</Text>

      <Text style={styles.label}>Costo total (opcional)</Text>

      <TextInput
        style={styles.input}
        keyboardType="numeric"
        placeholder="0"
        value={totalCost}
        onChangeText={setTotalCost}
      />

      <View style={styles.actions}>
        {onBack && (
          <PrimaryButton
            label="Atrás"
            tone="gray"
            onPress={onBack}
          />
        )}

        <PrimaryButton
          label={loading ? "Guardando..." : "Guardar tema"}
          onPress={handleSave}
          disabled={loading}
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
});

export default CreateProjectPaymentScreen;
