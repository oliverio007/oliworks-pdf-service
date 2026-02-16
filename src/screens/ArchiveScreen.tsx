import React, { useEffect, useMemo, useState } from "react";
import { Text, StyleSheet, TextInput, ScrollView, View, Pressable, Alert, Platform } from "react-native";
import { exportArchiveCSV, exportArchivePDF } from "../export";
import { formatDateEs, loadArchive, restoreArchiveVersionToInProcess } from "../storage/db";
import { ArchiveVersion } from "../types";
import { Card, PrimaryButton } from "../ui/components";

function confirmWeb(msg: string) {
  if (Platform.OS !== "web") return Promise.resolve(true);
  // @ts-ignore
  return Promise.resolve(window.confirm(msg));
}

export default function ArchiveScreen() {
  const [items, setItems] = useState<ArchiveVersion[]>([]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1).padStart(2, "0"));
  const [q, setQ] = useState("");

  useEffect(() => { (async () => setItems(await loadArchive()))(); }, []);

  const filtered = useMemo(() => {
  const ym = `${year}-${month}`;
  const s = q.trim().toLowerCase();

  return (items ?? [])
    .filter((a) => String(a?.projectSnapshot?.dateLabel ?? "").startsWith(ym))
    .filter((a) => {
      if (!s) return true;
      const p = a?.projectSnapshot ?? ({} as any);
      const instruments = Array.isArray(p.instruments) ? p.instruments : [];
      const hay = `${p.artist ?? ""} ${p.title ?? ""} ${instruments.join(" ")} v${a?.version ?? ""}`.toLowerCase();
      return hay.includes(s);
    })
    .sort((a, b) => (Number(b?.archivedAt ?? 0) - Number(a?.archivedAt ?? 0)));
}, [items, year, month, q]);


  async function refresh() { setItems(await loadArchive()); }

  async function restoreCopy(a: ArchiveVersion) {
    const ok = await confirmWeb("¿Restaurar una COPIA idéntica a En Proceso?");
    if (!ok) return;
    const created = await restoreArchiveVersionToInProcess(a.id);
    if (!created) { Alert.alert("Error","No se pudo restaurar."); return; }
    Alert.alert("Listo","Se creó una copia en En Proceso.");
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Archivo</Text>

      <Card title="Filtro">
        <Text style={styles.label}>Año</Text>
        <TextInput value={year} onChangeText={setYear} style={styles.input} placeholder="2025" />
        <Text style={styles.label}>Mes (01-12)</Text>
        <TextInput value={month} onChangeText={setMonth} style={styles.input} placeholder="12" />
        <Text style={styles.label}>Buscar</Text>
        <TextInput value={q} onChangeText={setQ} style={styles.input} placeholder="Artista / Tema / Instrumento / v2" />
        <PrimaryButton label="Refrescar" onPress={refresh} />
      </Card>

      <Card title={`Resultados (${filtered.length})`}>
        {filtered.length === 0 ? <Text style={{ opacity:0.7 }}>No hay resultados.</Text> : null}
        {filtered.slice(0,80).map((a) => {
          const p = a.projectSnapshot;
          return (
            <View key={a.id} style={styles.row}>
              <View style={{ flex:1 }}>
                <Text style={styles.bold}>{p.artist} / {p.title} — V{a.version}</Text>
<Text style={{ opacity:0.7 }}>{p?.dateLabel ? formatDateEs(p.dateLabel) : "Sin fecha"}</Text>
                <Text style={{ opacity:0.65, marginTop:4 }}>{p.instruments.join(", ")}</Text>
                <Pressable onPress={() => restoreCopy(a)} style={styles.restoreBtn}>
                  <Text style={styles.restoreText}>↩ Restaurar (copia a En Proceso)</Text>
                </Pressable>
              </View>
              <Text style={{ fontWeight:"900", opacity:0.7 }}>{p.progress}%</Text>
            </View> 
          );
        })}
      </Card>

      <Card title="Exportar">
        <PrimaryButton label="Exportar tabla (CSV / Excel)" onPress={() => exportArchiveCSV(filtered)} />
        <PrimaryButton
  label="Exportar PDF"
  onPress={() => exportArchivePDF(filtered, `Archivo ${year}-${month}`)}
/>

        <Text style={{ opacity:0.65, marginTop:8 }}>Excel abre perfecto el CSV.</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap:{ padding:16, paddingTop:22, gap:10 },
  title:{ fontSize:20, fontWeight:"900" },
  label:{ fontWeight:"900", marginTop:10, marginBottom:6, opacity:0.9 },
  input:{ backgroundColor:"rgba(255,255,255,0.9)", borderRadius:12, padding:12, borderWidth:1, borderColor:"rgba(0,0,0,0.12)" },
  row:{ flexDirection:"row", alignItems:"center", paddingVertical:10, gap:10 },
  bold:{ fontWeight:"900" },
  restoreBtn:{ marginTop:8, alignSelf:"flex-start", paddingVertical:6, paddingHorizontal:10, borderRadius:12, backgroundColor:"rgba(0,0,0,0.06)" },
  restoreText:{ fontWeight:"900", opacity:0.75 },
});
