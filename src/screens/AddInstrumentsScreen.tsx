import React, { useEffect, useMemo, useState } from "react";
import { Text, StyleSheet, Pressable, TextInput, Alert, ScrollView, View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AddStackParamList } from "../../App";
import { BANDA_INSTRUMENTS, GRUPO_INSTRUMENTS, OTROS_PAGE_1, OTROS_PAGE_2, BANDA_DEFAULT_ON, GRUPO_DEFAULT_ON } from "../data/instruments";
import { getDraft, updateDraft } from "../storage/db";
import { Card, PrimaryButton, SecondaryButton } from "../ui/components";
import { InstrumentGroupType } from "../types";

type Nav = NativeStackNavigationProp<AddStackParamList>;
type Route = { key: string; name: string; params: { draftId: string } };

export default function AddInstrumentsScreen() {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { draftId } = route.params;

  const [group, setGroup] = useState<InstrumentGroupType>("OTROS");
  const [page, setPage] = useState<1 | 2>(1);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const d = await getDraft(draftId);
      if (!d) return;
      const g = (d.group as any) || "OTROS";
      setGroup(g);

      const initial = (d.instruments || []) as string[];
      const sel: Record<string, boolean> = {};
      initial.forEach((x) => (sel[x] = true));
      setSelected(sel);

      // ✅ fallback: si viene vacío, aplica preset por grupo
      if (initial.length === 0) {
        const preset = g === "BANDA" ? BANDA_DEFAULT_ON : g === "GRUPO" ? GRUPO_DEFAULT_ON : [];
        const sel2: Record<string, boolean> = {};
        preset.forEach((x) => (sel2[x] = true));
        setSelected(sel2);
        await updateDraft(draftId, { instruments: preset });
      }
    })();
  }, [draftId]);

  const baseList = useMemo(() => {
    if (group === "BANDA") return BANDA_INSTRUMENTS;
    if (group === "GRUPO") return GRUPO_INSTRUMENTS;
    return page === 1 ? OTROS_PAGE_1 : OTROS_PAGE_2;
  }, [group, page]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter((x) => x.toLowerCase().includes(q));
  }, [baseList, query]);

  function toggle(name: string) {
    setSelected((prev) => ({ ...prev, [name]: !prev[name] }));
  }

  async function next() {
    const finalList = Object.keys(selected).filter((k) => !!selected[k]);
    if (finalList.length === 0) {
      Alert.alert("Selecciona algo", "Elige al menos un instrumento.");
      return;
    }
    await updateDraft(draftId, { instruments: finalList });

    if (group === "OTROS" && page === 1) {
      setPage(2);
      setQuery("");
      return;
    }
    nav.navigate("AddPayment", { draftId });
  }

  async function backPage() {
    if (group === "OTROS" && page === 2) {
      setPage(1);
      setQuery("");
      return;
    }
    nav.goBack();
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Instrumentación {group === "OTROS" ? `(Página ${page}/2)` : ""}</Text>

      <Card>
        <TextInput
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          placeholder="Buscar instrumento…"
        />

        {list.map((name) => {
          const on = !!selected[name];
          return (
            <Pressable key={name} onPress={() => toggle(name)} style={[styles.row, on && styles.rowOn]}>
              <Text style={[styles.name, on && styles.nameOn]}>{name}</Text>
              <Text style={[styles.check, on && styles.checkOn]}>{on ? "✓" : ""}</Text>
            </Pressable>
          );
        })}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <SecondaryButton label="Atrás" onPress={backPage} />
          <View style={{ flex: 1 }} />
          <PrimaryButton label={group === "OTROS" && page === 1 ? "Siguiente" : "Next"} onPress={next} />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 22, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },
  input: { backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.12)" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  rowOn: { backgroundColor: "rgba(40,170,80,0.12)" },
  name: { fontWeight: "800", opacity: 0.85 },
  nameOn: { opacity: 1 },
  check: { width: 24, textAlign: "center", fontWeight: "900", opacity: 0.5 },
  checkOn: { opacity: 1 },
});
