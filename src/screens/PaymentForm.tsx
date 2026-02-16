import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { Card, PrimaryButton } from "../ui/components";
import type { FinancialSnapshot } from "../services/payments";

/* =========================
   TYPES
========================= */

type Props = {
  title?: string;
  projectTitle?: string;
  artistName?: string;
  financialSnapshot?: FinancialSnapshot;

  onBack?: () => void;
  onAbono?: (amount: number) => Promise<void>;
  onLiquidado?: () => Promise<void>;
};

/* =========================
   HELPERS
========================= */

function money(n: number) {
  return (Number(n) || 0).toLocaleString("es-MX");
}

/* =========================
   COMPONENT
========================= */

const PaymentForm: React.FC<Props> = ({
  title = "Detalles de pago",
  projectTitle,
  artistName,
  financialSnapshot,
  onBack,
  onAbono,
  onLiquidado,
}) => {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const hasSnapshot = !!financialSnapshot;
  const remaining = Number(financialSnapshot?.remaining ?? 0);
  const isLiquidado = hasSnapshot && remaining <= 0;

  const handleAbono = async () => {
    const value = Number(amount);

    if (!value || value <= 0) {
      Alert.alert("Monto inválido", "Ingresa una cantidad válida");
      return;
    }

    if (value > remaining) {
      Alert.alert("Error", "El monto excede lo pendiente");
      return;
    }

    try {
      setLoading(true);
      await onAbono?.(value);
      setAmount("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>{title}</Text>

      {!!projectTitle && (
        <Text style={styles.subtitle}>
          {artistName ? `${artistName} • ` : ""}
          {projectTitle}
        </Text>
      )}

      {/* RESUMEN */}
      {hasSnapshot && (
        <Card title="Resumen">
          <Text style={styles.summary}>
            Costo total: ${money(financialSnapshot.totalCost)}
          </Text>
          <Text style={styles.summary}>
            Pagado: ${money(financialSnapshot.paid)}
          </Text>
          <Text style={[styles.summary, styles.bold]}>
            Pendiente: ${money(remaining)}
          </Text>

          {isLiquidado && (
            <Text style={styles.liquidado}>✓ LIQUIDADO</Text>
          )}
        </Card>
      )}

      {/* FORM ABONO */}
      {hasSnapshot && remaining > 0 && (
        <Card title="Registrar abono">
          <TextInput
            placeholder="Cantidad a abonar"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
            style={styles.input}
          />

          <PrimaryButton
            label={loading ? "Procesando..." : "Abonar"}
            onPress={handleAbono}
            disabled={loading}
          />
        </Card>
      )}

      {/* ACCIONES */}
      <Card>
        {onBack && (
          <PrimaryButton
            label="Volver"
            tone="gray"
            onPress={onBack}
          />
        )}

        {hasSnapshot && remaining > 0 && onLiquidado && (
          <PrimaryButton
            label={`Liquidar tema ($${money(remaining)})`}
            tone="green"
            onPress={onLiquidado}
          />
        )}
      </Card>
    </ScrollView>
  );
};

/* =========================
   STYLES
========================= */

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 14 },
  title: { fontSize: 20, fontWeight: "900" },
  subtitle: { marginTop: 2, opacity: 0.7, fontWeight: "800" },
  summary: { fontSize: 14, opacity: 0.85, marginTop: 6 },
  bold: { fontWeight: "900" },
  liquidado: {
    marginTop: 8,
    color: "#2e7d32",
    fontWeight: "900",
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    fontSize: 16,
  },
});

export default PaymentForm;
