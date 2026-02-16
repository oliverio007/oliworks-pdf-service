import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator } from "react-native";
import { signIn, signUp } from "../lib/supabase";

function normalizeEmail(v: string) {
  return v.trim().toLowerCase();
}

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    const e = normalizeEmail(email);
    return e.length >= 5 && e.includes("@") && password.length >= 6 && !loading;
  }, [email, password, loading]);

  async function handleSubmit() {
    const e = normalizeEmail(email);

    setError(null);
    setInfo(null);

    if (!e || !e.includes("@")) {
      setError("Escribe un correo válido.");
      return;
    }
    if (!password || password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    try {
      setLoading(true);

      if (mode === "signin") {
        await signIn(e, password);
        // ✅ No navegamos: App.tsx detecta session
        return;
      }

      // signup
      await signUp(e, password);
      setInfo("Cuenta creada. Si está activa la confirmación por correo, revisa tu email.");
      setMode("signin");
    } catch (e: any) {
      // Mensaje seguro y simple
      const msg = e?.message ?? String(e);

      // Pequeño “translator” de errores comunes
      if (msg.toLowerCase().includes("invalid login credentials")) {
        setError("Credenciales inválidas. Revisa correo/contraseña.");
      } else if (msg.toLowerCase().includes("email rate limit")) {
        setError("Demasiados intentos. Espera un momento y vuelve a intentar.");
      } else if (msg.toLowerCase().includes("user already registered")) {
        setError("Este correo ya tiene cuenta. Intenta iniciar sesión.");
        setMode("signin");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: "900" }}>
        {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
      </Text>

      <TextInput
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (error) setError(null);
        }}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="Correo"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
        }}
      />

      <TextInput
        value={password}
        onChangeText={(v) => {
          setPassword(v);
          if (error) setError(null);
        }}
        secureTextEntry
        placeholder="Contraseña"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 10,
          padding: 12,
        }}
      />

      {!!error && (
        <Text style={{ color: "#B00020", fontWeight: "800" }}>
          {error}
        </Text>
      )}

      {!!info && (
        <Text style={{ color: "rgba(0,0,0,0.75)", fontWeight: "800" }}>
          {info}
        </Text>
      )}

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: !canSubmit ? "#aaa" : "#111",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 10,
        }}
      >
        {loading && <ActivityIndicator />}
        <Text style={{ color: "white", fontWeight: "900" }}>
          {mode === "signin" ? (loading ? "Entrando…" : "Entrar") : (loading ? "Creando…" : "Crear cuenta")}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          setError(null);
          setInfo(null);
          setMode((m) => (m === "signin" ? "signup" : "signin"));
        }}
        disabled={loading}
        style={{
          padding: 14,
          borderRadius: 12,
          backgroundColor: "white",
          borderWidth: 1,
          borderColor: "#111",
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#111", fontWeight: "900" }}>
          {mode === "signin" ? "Crear cuenta" : "Ya tengo cuenta"}
        </Text>
      </Pressable>
    </View>
  );
}
