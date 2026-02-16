import React, { useEffect, useState } from "react";
import { View, Text, Button, ActivityIndicator, Alert } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import PaymentForm from "./PaymentForm";
import type { FinancialSnapshot } from "../services/payments";

import {
  applyProjectPayment,
  projectFinancials,
} from "../services/payments";

import { getProject } from "../storage/db";
import { syncProjectToSupabase } from "../api/projectSync";

import type { Project } from "../types";
import type { HomeStackParamList } from "../../App";

/* =========================
   NAV TYPES
========================= */

type Nav = NativeStackNavigationProp<
  HomeStackParamList,
  "PaymentDetails"
>;

type Route = RouteProp<
  { PaymentDetails: { projectId: string } },
  "PaymentDetails"
>;

/* =========================
   SCREEN
========================= */

export default function PaymentDetailsScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { projectId: projectLocalId } = route.params;

  const [project, setProject] = useState<Project | null>(null);
  const [snapshot, setSnapshot] =
    useState<FinancialSnapshot | null>(null);
  const [saving, setSaving] = useState(false);

  /* =========================
     LOAD PROJECT + SNAPSHOT
  ========================= */

  useEffect(() => {
    let alive = true;

    (async () => {
      const pr = await getProject(projectLocalId);
      if (!alive || !pr) return;

      setProject(pr);

      let projectUuid = (pr as any).project_id;

      // 🔥 AUTO-SYNC SI NO HAY UUID
      if (!projectUuid) {
        await syncProjectToSupabase(pr as any);
        const refreshed = await getProject(pr.id);
        projectUuid = (refreshed as any)?.project_id;
      }

      if (!projectUuid) {
        setSnapshot(null);
        return;
      }

      const fin = await projectFinancials(projectUuid);

      if (!alive) return;

      setSnapshot({
        totalCost: fin.totalCost,
        paid: fin.paid,
        remaining: fin.remaining,
      });
    })();

    return () => {
      alive = false;
    };
  }, [projectLocalId]);

  /* =========================
     ABONO
  ========================= */

  async function handleAbono(amount: number) {
    if (!project) return;

    try {
      setSaving(true);

      // 1️⃣ Asegurar UUID
      await syncProjectToSupabase(project as any);

      const refreshed = await getProject(project.id);
      if (!refreshed || !(refreshed as any).project_id) {
        throw new Error("Proyecto sin UUID");
      }

      const projectUuid = (refreshed as any).project_id;

      // 2️⃣ Aplicar pago
      await applyProjectPayment(projectUuid, amount);

      // 3️⃣ Refrescar snapshot
      const fin = await projectFinancials(projectUuid);

      setSnapshot({
        totalCost: fin.totalCost,
        paid: fin.paid,
        remaining: fin.remaining,
      });

    } catch (e: any) {
      console.error(e);
      Alert.alert(
        "Error",
        e.message ?? "No se pudo registrar el abono"
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================
     LIQUIDAR
  ========================= */

  async function liquidar() {
    if (!project || !snapshot) return;

    if (snapshot.remaining <= 0) {
      Alert.alert("Info", "El proyecto ya está liquidado");
      return;
    }

    try {
      setSaving(true);

      await syncProjectToSupabase(project as any);

      const refreshed = await getProject(project.id);
      if (!refreshed || !(refreshed as any).project_id) {
        throw new Error("Proyecto sin UUID");
      }

      const projectUuid = (refreshed as any).project_id;

      await applyProjectPayment(
        projectUuid,
        snapshot.remaining
      );

      const fin = await projectFinancials(projectUuid);

      setSnapshot({
        totalCost: fin.totalCost,
        paid: fin.paid,
        remaining: fin.remaining,
      });

    } catch (e: any) {
      console.error(e);
      Alert.alert(
        "Error",
        e.message ?? "No se pudo liquidar"
      );
    } finally {
      setSaving(false);
    }
  }

  /* =========================
     UI
  ========================= */

  if (!project) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ fontWeight: "900" }}>Cargando…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {snapshot ? (
        <PaymentForm
          title="Detalles de pago"
          projectTitle={project.title}
          artistName={project.artist ?? ""}
          financialSnapshot={snapshot}
          onBack={() => nav.goBack()}
          onAbono={handleAbono}
          onLiquidado={liquidar}
        />
      ) : (
        <View style={{ padding: 16 }}>
          <Text style={{ fontWeight: "900" }}>
            Sin información financiera
          </Text>
          <Text style={{ opacity: 0.7, marginTop: 6 }}>
            El proyecto aún no está sincronizado.
          </Text>
        </View>
      )}

      {saving && (
        <View
          style={{
            padding: 16,
            flexDirection: "row",
            gap: 10,
          }}
        >
          <ActivityIndicator />
          <Text style={{ fontWeight: "900" }}>
            Guardando…
          </Text>
        </View>
      )}

      <View style={{ padding: 16 }}>
        <Button
          title="Ver Wallet / Cobro"
          onPress={() =>
            nav.navigate("Charge", {
              projectId: projectLocalId,
            } as any)
          }
        />
      </View>
    </View>
  );
}
