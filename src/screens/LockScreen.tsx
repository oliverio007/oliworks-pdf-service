// src/screens/LockScreen.tsx
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { supabase } from "../lib/supabase";
import { useBiometric } from "../lib/biometricContext";

export default function LockScreen({ onUnlock }: { onUnlock: () => Promise<void> | void }) {
  const { biometricEnabled } = useBiometric();
  const [busy, setBusy] = useState(false);

  const subtitle = useMemo(() => {
    if (biometricEnabled === null) return "Cargando seguridad…";
    if (biometricEnabled === false) return "La huella está desactivada. Puedes continuar.";
    return "Bloqueado. Desbloquea con huella para continuar.";
  }, [biometricEnabled]);

  async function handleUnlock() {
    if (busy) return;
    try {
      setBusy(true);
      await onUnlock();
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    Alert.alert(
      "Cerrar sesión",
      "¿Quieres cerrar sesión en este dispositivo?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Cerrar sesión",
          style: "destructive",
          onPress: async () => {
            try {
              setBusy(true);
              await supabase.auth.signOut();
            } catch (e: any) {
              Alert.alert("Error", e?.message || "No se pudo cerrar sesión.");
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  const canUnlock = biometricEnabled !== null; // si aún carga, evita tocar

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: "900" }}>OliWorks</Text>

      <Text style={{ marginTop: 10, opacity: 0.75, fontWeight: "700" }}>{subtitle}</Text>

      <Pressable
        onPress={handleUnlock}
        disabled={!canUnlock || busy}
        style={{
          marginTop: 18,
          backgroundColor: "#111",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          opacity: !canUnlock || busy ? 0.65 : 1,
        }}
      >
        {busy ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator />
            <Text style={{ color: "#fff", fontWeight: "900" }}>Procesando…</Text>
          </View>
        ) : (
          <Text style={{ color: "#fff", fontWeight: "900" }}>
            {biometricEnabled === false ? "Entrar" : "Desbloquear"}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={handleLogout}
        disabled={busy}
        style={{
          marginTop: 12,
          backgroundColor: "rgba(0,0,0,0.07)",
          paddingVertical: 12,
          borderRadius: 14,
          alignItems: "center",
          opacity: busy ? 0.65 : 1,
        }}
      >
        <Text style={{ fontWeight: "900", opacity: 0.85 }}>Cerrar sesión</Text>
      </Pressable>

      <Text style={{ marginTop: 14, opacity: 0.55, fontWeight: "700", fontSize: 12 }}>
        Tip: Si cambiaste de teléfono o no reconoce la huella, cierra sesión y vuelve a iniciar.
      </Text>
    </View>
  );
}
