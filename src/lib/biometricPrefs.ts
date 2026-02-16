// src/lib/biometricPrefs.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "oli_biometric_enabled";

export async function getBiometricEnabled(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === null) return false; // default recomendado: OFF
    return v === "1";
  } catch {
    return false;
  }
}

export async function setBiometricEnabled(value: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, value ? "1" : "0");
}
