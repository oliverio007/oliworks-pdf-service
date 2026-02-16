// src/lib/biometric.ts
import * as LocalAuthentication from "expo-local-authentication";

export type BiometricResult =
  | { success: true; skipped?: boolean }
  | { success: false; skipped?: boolean; error?: string };

export async function canUseBiometrics(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function promptBiometricUnlock(): Promise<BiometricResult> {
  try {
    // Si no hay huella configurada, no bloqueamos
    const ok = await canUseBiometrics();
    if (!ok) {
      return { success: true, skipped: true };
    }

    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: "Desbloquear OliWorks",
      cancelLabel: "Cancelar",
      fallbackLabel: "Usar PIN",
      disableDeviceFallback: false, // permite PIN/patrón del sistema
      requireConfirmation: false,   // iOS: no pide doble confirmación
    });

    if (res.success) {
      return { success: true };
    }

    // Cancelado por usuario o sistema
    return {
      success: false,
      error: res.error ?? "FAILED",
    };
  } catch (e: any) {
    console.warn("[Biometric] exception:", e);
    return { success: false, error: "EXCEPTION" };
  }
}
