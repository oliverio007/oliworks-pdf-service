// src/lib/biometricContext.tsx
import React, { createContext, useContext } from "react";

type BiometricCtx = {
  biometricEnabled: boolean | null;
  setBiometricEnabled: (v: boolean) => Promise<void>;
};

const Ctx = createContext<BiometricCtx | null>(null);

export function BiometricProvider({
  value,
  children,
}: {
  value: BiometricCtx;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBiometric() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBiometric() must be used inside BiometricProvider");
  return ctx;
}
