// src/screens/DailyBriefingScreen.tsx
import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";



import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";

import { Card, PrimaryButton } from "../ui/components";
import {
  formatDateEs,
  loadAgenda,
  loadPendings,
  loadProjects,
  todayLabel,
} from "../storage/db";

import { getDailyBriefing } from "../api/dailyBriefing";


// Si ya tienes este endpoint, lo intentamos usar.
// Si no existe o falla, cae al fallback local.


type Briefing = {
  message: string;
  suggestions: string[];
  meta?: {
    dateLabel: string;
    counts: {
      agendaToday: number;
      agendaNext3Days: number;
      pendingsOpen: number;
      projectsInProcess: number;
      projectsStale: number;
      nearDone: number; // ✅ nuevo
    };
    staleProjects?: Array<{ id: string; title: string; days: number }>;
    nearDoneProjects?: Array<{ id: string; title: string; pct: number }>; // ✅ nuevo
    topPendings?: Array<{ id?: string; text: string }>;
    nextAgenda?: Array<{ id?: string; dateLabel: string; artist: string; note?: string }>;
    suggestedProjectId?: string | null;
  };
};

const KEY_DAILY_BRIEFING_PREFIX = "oliworks_daily_briefing_v1:";

function ymdPlusDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function daysBetween(olderMs: number, newerMs: number) {
  const diff = Math.max(0, newerMs - olderMs);
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function buildLocalBriefing(context: {
  today: string;
  agenda: Array<{ id?: string; dateLabel: string; artist: string; note?: string }>;
  pendings: Array<{ id?: string; text: string }>;
  projects: Array<{
    id: string;
    title: string;
    progress?: number;
    status?: string;
    updatedAt?: number;
    updated_at?: number;
    totalCost?: number;
    total_cost?: number;
    payment?: { cost?: number; paidInFull?: boolean };
  }>;
}): Briefing {
  const now = Date.now();
  const todayNice = formatDateEs(context.today);

  const todayAgenda = context.agenda.filter((a) => a.dateLabel === context.today);
  const nextAgenda = context.agenda.filter((a) => a.dateLabel !== context.today);

  const pendCount = context.pendings.length;

  const inProc = context.projects;
  const inProcCount = inProc.length;

  // ✅ casi listos (80%+), incluye 100%
  const nearDone = inProc
    .map((p) => {
      const pct = typeof p.progress === "number" ? p.progress : Number((p as any).progress) || 0;
      return { id: p.id, title: p.title, pct };
    })
    .filter((x) => x.pct >= 80)
    .sort((a, b) => b.pct - a.pct);

  const nearDoneCount = nearDone.length;

  // “stale” = no actualizado en 7+ días
  const stale = inProc
    .map((p) => {
      const u =
        typeof p.updatedAt === "number"
          ? p.updatedAt
          : typeof (p as any).updated_at === "number"
          ? (p as any).updated_at
          : 0;
      const days = u ? daysBetween(u, now) : 999;
      return { id: p.id, title: p.title, days, updatedMs: u || 0, p };
    })
    .filter((x) => x.days >= 7)
    .sort((a, b) => b.days - a.days);

  const staleCount = stale.length;

  // ✅ proyecto sugerido:
  // 1) el #1 de casi listos (para cerrar)
  // 2) si no, el más atrasado
  // 3) si no, el menos actualizado
  const suggested =
    nearDone[0]?.id ??
    stale[0]?.id ??
    (inProc
      .slice()
      .sort((a: any, b: any) => {
        const au = typeof a.updatedAt === "number" ? a.updatedAt : Number(a.updatedAt) || 0;
        const bu = typeof b.updatedAt === "number" ? b.updatedAt : Number(b.updatedAt) || 0;
        return au - bu;
      })[0]?.id ?? null);

  // alertas de cobro simples: costo>0 pero no pagado completo
  const payAlerts = inProc
    .map((p) => {
      const total =
        typeof p.totalCost === "number"
          ? p.totalCost
          : typeof (p as any).total_cost === "number"
          ? (p as any).total_cost
          : typeof p.payment?.cost === "number"
          ? p.payment.cost
          : 0;

      const paid = !!p.payment?.paidInFull;
      return { id: p.id, title: p.title, total, paid };
    })
    .filter((x) => x.total > 0 && !x.paid)
    .slice(0, 3);

  const lines: string[] = [];
  lines.push(`📅 Hoy: ${todayNice}`);

  if (todayAgenda.length === 0) lines.push(`• Sesiones hoy: 0`);
  else lines.push(`• Sesiones hoy (${todayAgenda.length}): ${todayAgenda.map((a) => a.artist).join(", ")}`);

  if (nextAgenda.length > 0) {
    const next3 = nextAgenda
      .slice(0, 3)
      .map((a) => `${a.artist} (${formatDateEs(a.dateLabel)})`)
      .join(" · ");
    lines.push(`• Próximas (3 días): ${next3}`);
  } else {
    lines.push(`• Próximas (3 días): —`);
  }

  lines.push(`• Pendientes abiertos: ${pendCount}${pendCount === 0 ? " ✅" : ""}`);
  lines.push(`• Temas en proceso: ${inProcCount}`);
  lines.push(`• ✅ Casi listos (80%+): ${nearDoneCount}${nearDoneCount > 0 ? " 🔥" : ""}`);

  // Alertas
  const alertLines: string[] = [];
  if (staleCount > 0) alertLines.push(`⏳ Atrasados (7+ días sin update): ${staleCount}`);
  if (payAlerts.length > 0) alertLines.push(`💸 Cobro pendiente (costo y no pagado): ${payAlerts.length}`);

  if (alertLines.length > 0) {
    lines.push("");
    lines.push("⚠️ Alertas");
    for (const a of alertLines) lines.push(`• ${a}`);
  }

  // Detalle corto de alertas (solo 1-3 items)
  if (nearDoneCount > 0) {
    lines.push(`• Top casi listo: ${nearDone[0].title} (${nearDone[0].pct}%)`);
  }
  if (staleCount > 0) {
    lines.push(`• Más atrasado: ${stale[0].title} (${stale[0].days} días)`);
  }
  if (payAlerts.length > 0) {
    lines.push(`• Cobro top: ${payAlerts[0].title} (costo aprox: $${payAlerts[0].total})`);
  }

  const suggestions: string[] = [];

  if (todayAgenda.length > 0) {
    suggestions.push(`Confirmar horarios con: ${todayAgenda[0].artist}`);
    suggestions.push(`Preparar sesión 15 min antes (plantilla + ruteo + sesión Pro Tools).`);
  } else {
    suggestions.push(`Bloquea 60 min hoy para avanzar 1 tema (sin distracciones).`);
  }

  if (pendCount > 0) {
    suggestions.push(`Resuelve 1 pendiente rápido: ${context.pendings[0].text}`);
  }

  if (nearDoneCount > 0) {
    suggestions.push(`Cierra hoy el “casi listo”: ${nearDone[0].title} (últimos detalles y export).`);
  } else if (staleCount > 0) {
    suggestions.push(`Haz un “micro-update” al tema más atrasado (aunque sea +5% y nota).`);
  } else if (inProcCount > 0) {
    suggestions.push(`Elige 1 tema y súbele +10% hoy (checklist).`);
  }

  if (payAlerts.length > 0) {
    suggestions.push(`Agenda un recordatorio de cobro para: ${payAlerts[0].title}`);
  }

  while (suggestions.length < 3) suggestions.push("Haz un micro-bloque de 25 min sin distracciones.");

  return {
    message: lines.join("\n"),
    suggestions: suggestions.slice(0, 6),
    meta: {
      dateLabel: context.today,
      counts: {
        agendaToday: todayAgenda.length,
        agendaNext3Days: nextAgenda.length,
        pendingsOpen: pendCount,
        projectsInProcess: inProcCount,
        projectsStale: staleCount,
        nearDone: nearDoneCount,
      },
      staleProjects: stale.slice(0, 5).map((x) => ({ id: x.id, title: x.title, days: x.days })),
      nearDoneProjects: nearDone.slice(0, 5),
      topPendings: context.pendings.slice(0, 5),
      nextAgenda: context.agenda.slice(0, 6),
      suggestedProjectId: suggested,
    },
  };
}

async function saveBriefingLocal(dateLabel: string, briefing: Briefing) {
  const key = `${KEY_DAILY_BRIEFING_PREFIX}${dateLabel}`;
  await AsyncStorage.setItem(key, JSON.stringify(briefing));
}

export default function DailyBriefingScreen() {
  const nav = useNavigation<any>();

  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => todayLabel(), []);

  const generate = useCallback(async () => {
  // evita doble corrida si ya está corriendo
  if (loading) return;

  setLoading(true);
  setError(null);

  try {
    const [agendaAll, pendingsAll, projectsAll] = await Promise.all([
      loadAgenda(),
      loadPendings(),
      loadProjects(),
    ]);

    const until = ymdPlusDays(today, 3);

    const agenda = (agendaAll as any[])
      .filter(
        (a: any) =>
          !a?.deletedAt &&
          !a?.deleted_at &&
          String(a?.dateLabel || "") >= today &&
          String(a?.dateLabel || "") <= until
      )
      .sort((a: any, b: any) => String(a.dateLabel).localeCompare(String(b.dateLabel)))
      .slice(0, 12)
      .map((a: any) => ({
        id: a.id,
        dateLabel: a.dateLabel,
        artist: a.artist,
        note: a.note,
      }));

    const pendings = (pendingsAll as any[])
      .filter((p: any) => !p?.deletedAt && !p?.deleted_at && !p?.done)
      .sort((a: any, b: any) => (b?.createdAt || 0) - (a?.createdAt || 0))
      .slice(0, 10)
      .map((p: any) => ({ id: p.id, text: p.text }));

    const projects = (projectsAll as any[])
      .filter((p: any) => !p?.deletedAt && !p?.deleted_at && p?.status === "EN_PROCESO")
      .map((p: any) => ({
        id: p.id,
        title: p.title,
        progress: p.progress,
        status: p.status,
        updatedAt: p.updatedAt,
        updated_at: p.updated_at,
        totalCost: p.totalCost,
        total_cost: p.total_cost,
        payment: p.payment,
      }))
      .slice(0, 50);

    const context = { today, agenda, pendings, projects };

    let remote: any = null;
    try {
      remote = await (getDailyBriefing as any)(context);
    } catch {
      remote = null;
    }

    const finalBriefing: Briefing =
      remote && typeof remote === "object" && typeof remote.message === "string"
        ? {
            message: String(remote.message),
            suggestions: Array.isArray(remote.suggestions) ? remote.suggestions : [],
            meta: remote.meta, // si tu backend manda meta, lo respetamos
          }
        : buildLocalBriefing(context);

    setBriefing(finalBriefing);
    await saveBriefingLocal(today, finalBriefing);
  } catch (e: any) {
    setError(String(e?.message || e || "Error"));
  } finally {
    setLoading(false);
  }
}, [today, loading]);

  const route = useRoute<any>();
const autoRunId = route?.params?.autoRunId as number | undefined;

// para que corra 1 vez por cada click (cada click manda un id nuevo)
const lastAutoRunRef = useRef<number | null>(null);

useFocusEffect(
  useCallback(() => {
    if (!autoRunId) return;

    // evita repetir en re-renders o si vuelves al screen sin nuevo click
    if (lastAutoRunRef.current === autoRunId) return;
    lastAutoRunRef.current = autoRunId;

    generate();
  }, [autoRunId, generate])
);




  const suggestedProjectId = briefing?.meta?.suggestedProjectId ?? null;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.title}>Oli Smart</Text>

      

      <Card title="Resultado">
        {!briefing ? (
          <Text style={{ opacity: 0.65 }}>Presiona “Generar briefing”.</Text>
        ) : (
          <>
            <Text style={styles.msg}>{briefing.message}</Text>

            {briefing.suggestions?.length > 0 && (
              <View style={{ marginTop: 12, gap: 8 }}>
                <Text style={styles.subTitle}>Sugerencias</Text>
                {briefing.suggestions.map((s, i) => (
                  <View key={i} style={styles.sugRow}>
                    <Text style={styles.bullet}>•</Text>
                    <Text style={styles.sugTxt}>{s}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ✅ Casi listos (Top 3) */}
            {!!briefing.meta?.nearDoneProjects?.length && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={styles.subTitle}>Casi listos (80%+)</Text>
                {briefing.meta.nearDoneProjects.slice(0, 3).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => nav.navigate("Details", { projectId: p.id })}
                    style={styles.linkRow}
                  >
                    <Text style={styles.linkTxt}>• {p.title} — {p.pct}%</Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* ✅ Atrasados (Top 3) */}
            {!!briefing.meta?.staleProjects?.length && (
              <View style={{ marginTop: 12, gap: 6 }}>
                <Text style={styles.subTitle}>Atrasados (top)</Text>
                {briefing.meta.staleProjects.slice(0, 3).map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => nav.navigate("Details", { projectId: p.id })}
                    style={styles.linkRow}
                  >
                    <Text style={styles.linkTxt}>• {p.title} — {p.days} días</Text>
                  </Pressable>
                ))}
              </View>
            )}

            <Pressable onPress={() => setBriefing(null)} style={styles.clearBtn}>
              <Text style={styles.clearTxt}>Limpiar</Text>
            </Pressable>
          </>
        )}
      </Card>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 18, gap: 10 },
  title: { fontSize: 20, fontWeight: "900" },

  msg: {
    fontWeight: "800",
    opacity: 0.85,
    lineHeight: 20,
  },

  subTitle: { fontWeight: "900", opacity: 0.85 },
  sugRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  bullet: { fontWeight: "900", opacity: 0.7 },
  sugTxt: { flex: 1, fontWeight: "800", opacity: 0.8 },

  error: { marginTop: 10, fontWeight: "900", color: "#b00020" },

  clearBtn: {
    marginTop: 14,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  clearTxt: { fontWeight: "900", opacity: 0.75 },

  quickActions: {
    marginTop: 10,
    gap: 10,
  },

  counts: {
    marginTop: 10,
    fontWeight: "900",
    opacity: 0.7,
  },

  linkRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  linkTxt: { fontWeight: "900", opacity: 0.8 },
});
