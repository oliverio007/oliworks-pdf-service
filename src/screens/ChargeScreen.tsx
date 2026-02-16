import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
} from "react-native";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { HomeStackParamList } from "../../App";

import { resolveProjectUuid } from "../storage/db";

import { supabase } from "../lib/supabase";

type ChargeRoute = RouteProp<HomeStackParamList, "Charge">;

type ProjectFinance = {
  id: string;
  title: string;
  total_cost: number;
  amount_paid: number;
};

type PaymentItem = {
  id: string;
  amount: number;
  created_at: string;
};

type PaymentsResponse = {
  ok: boolean;
  project_id: string;
  summary: {
    total_cost: number;
    amount_paid: number;
    remaining: number;
  };
  payments: PaymentItem[];
};

function PrimaryBtn(props: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      disabled={!!props.disabled}
      style={({ pressed }) => [
        styles.btn,
        props.disabled ? styles.btnDisabled : null,
        pressed && !props.disabled ? styles.btnPressed : null,
      ]}
    >
      <Text style={styles.btnText}>{props.title}</Text>
    </Pressable>
  );
}

export default function ChargeScreen() {
  const route = useRoute<ChargeRoute>();
  const { projectId } = route.params;

  const [projectUuid, setProjectUuid] = useState<string | null>(null);


  const [project, setProject] = useState<ProjectFinance | null>(null);
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
  (async () => {
    try {
      const uuid = await resolveProjectUuid(projectId);
      setProjectUuid(uuid);
    } catch (e) {
      console.log("[Charge] resolve UUID error:", e);
    }
  })();
}, [projectId]);

  /* --------------------------------------------------
   * Load project data

   * -------------------------------------------------- */
  const loadProject = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
  .from("project_billing_summary")
  .select("project_id,total_cost,paid,remaining")
  .eq("project_id", projectUuid)
  .maybeSingle();


      if (error || !data) {
        console.log("[Charge] load project error:", error);
        setProject(null);
        return;
      }

      setProject({
  id: data?.project_id ?? projectUuid,
  title: project?.title ?? "", // si lo cargas aparte
  total_cost: Number(data?.total_cost ?? 0),
  amount_paid: Number(data?.paid ?? 0),
});

    } finally {
      setLoading(false);
    }
  }, [projectId]);

  /* --------------------------------------------------
   * Load payments history
   * -------------------------------------------------- */
  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "project-payments-list",
        {
          method: "GET",
path: `?project_id=${encodeURIComponent(String(projectUuid))}`,
        } as any
      );

      if (error || !data?.ok) {
        console.log("[Charge] load payments error:", error);
        setPayments([]);
        return;
      }

      const payload = data as PaymentsResponse;
      setPayments(payload.payments ?? []);
    } finally {
      setLoadingPayments(false);
    }
  }, [projectId]);

  useEffect(() => {
  if (!projectUuid) return;
  loadProject();
  loadPayments();
}, [projectUuid]);


  /* --------------------------------------------------
   * Apply payment
   * -------------------------------------------------- */
  async function handleApply() {
    if (!project) return;

    const remaining = Math.max(
      0,
      project.total_cost - project.amount_paid
    );

    if (remaining <= 0) {
      Alert.alert("Proyecto liquidado", "Este proyecto ya está pagado.");
      return;
    }

    Alert.prompt(
      "Abonar",
      `Pendiente: $${remaining}\n¿Cuánto deseas abonar?`,
      async (value) => {
        const amount = Number(value);

        if (!Number.isFinite(amount) || amount <= 0) {
          Alert.alert("Monto inválido");
          return;
        }

        if (amount > remaining) {
          Alert.alert(
            "Monto excede pendiente",
            `El máximo es $${remaining}`
          );
          return;
        }

        try {
          setApplying(true);

          const { error } = await supabase.functions.invoke(
            "project-payment",
            {
              body: {
project_id: projectUuid,
                amount,
              },
            }
          );

          if (error) {
            Alert.alert("Error", error.message);
            return;
          }

          Alert.alert("OK", `Abono aplicado: $${amount}`);
          await loadProject();
          await loadPayments();
        } finally {
          setApplying(false);
        }
      },
      "plain-text"
    );
  }

  /* --------------------------------------------------
   * Render states
   * -------------------------------------------------- */
  if (loading) {
    return (
      <View style={styles.page}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Cargando cobro…</Text>
      </View>
    );
  }

  if (!project) {
    return (
      <View style={styles.page}>
        <Text style={styles.h1}>Cobro del Proyecto</Text>
        <Text>No se pudo cargar el proyecto.</Text>
        <View style={{ marginTop: 14 }}>
          <PrimaryBtn title="Reintentar" onPress={loadProject} />
        </View>
      </View>
    );
  }

  const remaining = Math.max(
    0,
    project.total_cost - project.amount_paid
  );

  return (
    <View style={styles.page}>
      <Text style={styles.h1}>Cobro del Proyecto</Text>

      <Text style={styles.line}>Tema: {project.title}</Text>
      <Text style={styles.line}>Costo total: ${project.total_cost}</Text>
      <Text style={styles.line}>Abonado: ${project.amount_paid}</Text>
      <Text style={styles.line}>Pendiente: ${remaining}</Text>

      <View style={{ marginTop: 22 }}>
        <PrimaryBtn
          title={applying ? "Aplicando..." : "ABONAR"}
          onPress={handleApply}
          disabled={applying || remaining <= 0}
        />
      </View>

      {/* -------------------- HISTORIAL -------------------- */}
      <View style={{ marginTop: 26 }}>
        <Text style={styles.h2}>Historial de abonos</Text>

        {loadingPayments && (
          <Text style={styles.muted}>Cargando historial…</Text>
        )}

        {!loadingPayments && payments.length === 0 && (
          <Text style={styles.muted}>Aún no hay abonos registrados.</Text>
        )}

        {!loadingPayments &&
          payments.map((p) => (
            <View key={p.id} style={styles.paymentRow}>
              <Text style={styles.paymentDate}>
                {new Date(p.created_at).toLocaleDateString()}
              </Text>
              <Text style={styles.paymentAmount}>${p.amount}</Text>
            </View>
          ))}
      </View>

      <View style={{ marginTop: 20 }}>
        <PrimaryBtn title="RECARGAR" onPress={() => {
          loadProject();
          loadPayments();
        }} />
      </View>
    </View>
  );
}

/* --------------------------------------------------
 * Styles
 * -------------------------------------------------- */
const styles = StyleSheet.create({
  page: {
    padding: 16,
    backgroundColor: "#fff",
    flex: 1,
  },
  h1: {
    fontWeight: "900",
    fontSize: 22,
    marginBottom: 12,
  },
  h2: {
    fontWeight: "800",
    fontSize: 18,
    marginBottom: 8,
  },
  line: {
    fontSize: 16,
    marginBottom: 2,
  },
  muted: {
    opacity: 0.6,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  paymentDate: {
    fontSize: 14,
  },
  paymentAmount: {
    fontSize: 14,
    fontWeight: "700",
  },
  btn: {
    backgroundColor: "#1e88e5",
    paddingVertical: 16,
    borderRadius: 3,
    alignItems: "center",
  },
  btnPressed: {
    opacity: 0.9,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 16,
    letterSpacing: 0.5,
  },
});
