// src/ui/components.tsx (o donde tengas Card)

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

export function Card(props: { title?: string; children: React.ReactNode }) {
  const safeChildren = React.Children.map(props.children, (child) => {
    if (typeof child === "string" || typeof child === "number") {
      return <Text style={{ fontSize: 13, opacity: 0.85 }}>{child}</Text>;
    }
    return child as any;
  });

  return (
    <View style={styles.card}>
      {props.title ? <Text style={styles.cardTitle}>{props.title}</Text> : null}
      {safeChildren}
    </View>
  );
}

export function PrimaryButton(props: {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  tone?: "blue" | "green" | "gray" | "red";
  disabled?: boolean;
}) {
  const bg =
    props.tone === "green"
      ? "rgba(60, 190, 90, 0.95)"
      : props.tone === "gray"
      ? "rgba(0,0,0,0.15)"
      : props.tone === "red"
      ? "rgba(220, 53, 69, 0.95)"
      : "rgba(30, 136, 229, 0.95)";

  return (
    <Pressable
      onPress={props.disabled ? undefined : props.onPress}
      onLongPress={props.onLongPress}
      delayLongPress={350}
      disabled={props.disabled}
      style={[
        styles.btn,
        { backgroundColor: bg },
        props.disabled && styles.btnDisabled,
      ]}
    >
      <Text style={styles.btnText}>{props.label}</Text>
    </Pressable>
  );
}


export function SecondaryButton(props: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={props.onPress} style={styles.btn2}>
      <Text style={styles.btn2Text}>{props.label}</Text>
    </Pressable>
  );
}

export function ProgressBar(props: { value: number; tone?: "blue" | "green" }) {
  const v = Math.max(0, Math.min(100, props.value));
  const fill =
    props.tone === "green"
      ? "rgba(60, 190, 90, 0.9)"
      : "rgba(30, 136, 229, 0.9)";

  return (
    <View style={styles.pbOuter}>
      <View style={[styles.pbInner, { width: `${v}%`, backgroundColor: fill }]} />
      <Text style={styles.pbText}>{v}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.86)",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  cardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10, opacity: 0.9 },
  btn: {
    backgroundColor: "#2b6cff",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  btnDisabled: {
  opacity: 0.5,
},

  btnText: { color: "white", fontWeight: "900", fontSize: 16 },
  btn2: {
    backgroundColor: "rgba(0,0,0,0.06)",
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 10,
  },
  btn2Text: { color: "rgba(0,0,0,0.75)", fontWeight: "900", fontSize: 15 },
  pbOuter: {
    width: 130,
    height: 18,
    backgroundColor: "rgba(0,0,0,0.12)",
    borderRadius: 12,
    overflow: "hidden",
    justifyContent: "center",
  },
  pbInner: { height: 18 },
  pbText: {
    position: "absolute",
    right: 6,
    fontSize: 12,
    fontWeight: "900",
    color: "rgba(0,0,0,0.7)",
  },
});
