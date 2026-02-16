  // src/screens/DetailsScreen.tsx
  import React, { useEffect, useState } from "react";
  import {
    ScrollView,
    StyleSheet,
    Text,
    View,
    Pressable,
    Alert,
    Platform,
    TextInput,
  } from "react-native";
  import { useFocusEffect, useIsFocused, useNavigation, useRoute } from "@react-navigation/native";
  import { NativeStackNavigationProp } from "@react-navigation/native-stack";





  import { HomeStackParamList } from "../../App";
  import { Card, PrimaryButton, ProgressBar } from "../ui/components";

  import {
    canCloseProject,
    getClosureBlockingReasons,
  } from "@/production/rules";
  //import { handleAskProject } from "@/production";

  import { runQuickQuery } from "@/production/quickQueries";


  import {
    parseQuickCommand,
    applyQuickCommandToProject,
  } from "@/production/quickCommands";


  import {
    formatDateEs,
    loadProjects,
    saveProjects,
    computeProgress,
    computeStatus,
    archiveProject,   // ✅ importa este
    deleteProject,
    getArtistProfile,
    normalizeArtistLocalId,
    syncProjects,
  } from "../storage/db";


  import { ChecklistKey, Project } from "../types";
  import { supabase } from "../lib/supabase";


  type Nav = NativeStackNavigationProp<HomeStackParamList>;
  type RouteParams = { projectId: string };

  const ORDER: ChecklistKey[] = [
    "GUIAS_QUANTIZ",
    "ARREGLOS",
    "MUSICOS",
    "EDICION",
    "AFINACION",
    "MIX",
    "MASTER",
  ];

  const LABEL: Record<ChecklistKey, string> = {
    GUIAS_QUANTIZ: "Guía",
    ARREGLOS: "Arreglos",
    MUSICOS: "Músicos",
    EDICION: "Edición",
    AFINACION: "Afinación",
    MIX: "Mix",
    MASTER: "Master",
  };

  const TOGGLES: ChecklistKey[] = ["GUIAS_QUANTIZ", "ARREGLOS", "MIX", "MASTER"];
  type DeepSection = "MUSICOS" | "EDICION" | "AFINACION";

  type BillingRow = {
    project_local_id: string;
    total_cost?: number | null;
    paid?: number | null;
    remaining?: number | null;
  };


  type QuickFeedback =
    | { type: "success"; text: string }
    | { type: "error"; text: string }
    | { type: "info"; text: string }
    | null;

  export default function DetailsScreen() {
    const nav = useNavigation<Nav>();
    const route = useRoute();
    const isFocused = useIsFocused();

    const { projectId } = (route.params || {}) as RouteParams;

    const [project, setProject] = useState<Project | null>(null);
    const [openCobro, setOpenCobro] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickFeedback, setQuickFeedback] =
    useState<QuickFeedback>(null);




    // ✅ Artist profile (displayName + note)
    const [artistDisplayName, setArtistDisplayName] = useState("");
    const [artistNote, setArtistNote] = useState("");

    // 🧠 Cobro real desde Supabase (vista project_billing_summary)
    const [billing, setBilling] = useState<BillingRow | null>(null);
    const [billingLoading, setBillingLoading] = useState(false);

    async function refresh() {
      const all = await loadProjects();
      const p = (all.find((x: any) => x.id === projectId) ?? null) as Project | null;
      setProject(p);

      // ✅ carga profile por artistKey estable
      const key =
        String((p as any)?.artistLocalId ?? (p as any)?.artist_local_id ?? "").trim() ||
        normalizeArtistLocalId(String((p as any)?.artist ?? "").trim());

      if (!key) {
        setArtistDisplayName("");
        setArtistNote("");
        return;
      }

      const pr = await getArtistProfile(key);
      setArtistDisplayName(String((pr as any)?.displayName ?? "").trim());
      setArtistNote(String((pr as any)?.note ?? "").trim());
    }

  useFocusEffect(
    React.useCallback(() => {
      refresh();
    }, [projectId])
  );


  useEffect(() => {
  if (!isFocused) return;

  let alive = true;

  (async () => {
    try {
      setBillingLoading(true);

      // 1️⃣ Obtener UUID real del proyecto
      const { data: projectRow } = await supabase
        .from("projects")
        .select("id")
        .eq("local_id", projectId)
        .maybeSingle();

      if (!projectRow?.id) {
        if (alive) setBilling(null);
        return;
      }

      const projectUuid = projectRow.id;

      // 2️⃣ Leer vista financiera oficial
      const { data, error } = await supabase
        .from("project_billing_summary")
        .select("project_id,total_cost,paid,remaining")
        .eq("project_id", projectUuid)
        .maybeSingle();

      if (error) {
        console.log("[billing] error:", error);
      }

      if (!alive) return;

      if (!data) {
        setBilling(null);
        return;
      }

      setBilling({
        project_local_id: projectId,
        total_cost: Number(data.total_cost ?? 0),
        paid: Number(data.paid ?? 0),
        remaining: Number(data.remaining ?? 0),
      });

    } finally {
      if (alive) setBillingLoading(false);
    }
  })();

  return () => {
    alive = false;
  };
}, [isFocused, projectId]);



    async function updateProject(patchOrFull: Partial<Project> | Project) {
      const all = await loadProjects();

      const next = (all as any[]).map((p) => {
        if (p.id !== projectId) return p;

        // si viene completo
        if ("id" in (patchOrFull as any)) {
          const full = patchOrFull as Project;
          return {
            ...full,
            pendingSync: true,
            localUpdatedAt: Date.now(),
          };
        }

        // si viene patch
        return {
          ...p,
          ...(patchOrFull as Partial<Project>),
          pendingSync: true,
          localUpdatedAt: Date.now(),
        };
      });

      await saveProjects(next as any);

      const updated = ((next as any[]).find((p) => p.id === projectId) ?? null) as Project | null;
      setProject(updated);

      // ✅ recomendado: empuja cambios para que no los pise el pull
      try {
        await syncProjects();
      } catch (e) {
        console.log("[Details] syncProjects after update failed:", e);
      }
    }

    function goBackToHome() {
      nav.popToTop();
      nav.getParent()?.navigate("HomeTab" as never);
    }

    async function removeNow() {
      if (!project) return;
      await deleteProject(project.id);
      goBackToHome();
    }


    function removeProject() {
      if (!project) return;

const label = `${project.artist ?? ""} - ${project.title}`;

      if (Platform.OS === "web") {
        // @ts-ignore
        const ok = window.confirm(`¿Borrar el tema “${label}” definitivamente?`);
        if (!ok) return;
        removeNow();
        return;
      }

      Alert.alert("Borrar Tema", `¿Borrar el tema “${label}” definitivamente?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Borrar", style: "destructive", onPress: () => removeNow() },
      ]);
    }

    function goSection(section: DeepSection) {
      nav.navigate("InstrumentSection" as any, { projectId, section } as any);
    }
  function goPayment() {
    nav.navigate("PaymentDetails" as any, {
      projectId,
      projectTitle: project?.title ?? "",
artistName: (artistDisplayName?.trim() || project?.artist || "").trim(),
    } as any);
  }


    
    async function testQuickCommand(text: string) {
    if (!project) return;

    const cleanText = text.trim();
    if (!cleanText) return;

    // reset feedback
    setQuickFeedback(null);

    /* --------------------------------------------------
    * 1️⃣ INTENTA QUERY (preguntas, NO modifica nada)
    * -------------------------------------------------- */
    const queryResult = runQuickQuery(project, cleanText);
    if (queryResult) {
      setQuickFeedback(queryResult);
      return;
    }

    /* --------------------------------------------------
    * 2️⃣ INTENTA COMMAND (acciones, sí modifica)
    * -------------------------------------------------- */
    const parsed = parseQuickCommand(cleanText);

    if (!parsed) {
      setQuickFeedback({
        type: "error",
        text: 'No entendí el comando. Ej: "ya se grabaron trombones"',
      });
      return;
    }

    const { project: updated, applied } =
      applyQuickCommandToProject(project, parsed);

    /* --------------------------------------------------
    * 3️⃣ SIN CAMBIOS REALES
    * -------------------------------------------------- */
    if (!applied.length) {
      setQuickFeedback({
        type: "info",
        text: "No se encontró ningún instrumento para marcar.",
      });
      return;
    }

    /* --------------------------------------------------
    * 4️⃣ GUARDAR CAMBIOS
    * -------------------------------------------------- */
    await updateProject(updated);

    setQuickText("");

    /* --------------------------------------------------
    * 5️⃣ FEEDBACK FINAL
    * -------------------------------------------------- */
    setQuickFeedback({
      type: "success",
      text: `✔️ ${applied.join(", ")}`,
    });
  }



    async function toggleChecklist(key: ChecklistKey) {
      if (!project) return;

      const prevChecklist = (project.checklist ?? {}) as any;
      const prevVal = !!prevChecklist[key];

      const nextProject: Project = {
        ...project,
        checklist: { ...prevChecklist, [key]: !prevVal },
        updatedAt: Date.now(),
      };

      (nextProject as any).progress = computeProgress(nextProject as any);
      (nextProject as any).status = computeStatus(nextProject as any);

      await updateProject(nextProject);
    }

    
    async function markSectionDeep(section: DeepSection) {
      if (!project) return;

      const instruments = project.instruments || [];
      if (instruments.length === 0) {
        Alert.alert("Sin instrumentos", "Este tema no tiene instrumentos aún.");
        return;
      }

      const mapKey =
        section === "MUSICOS"
          ? ("musiciansDone" as const)
          : section === "EDICION"
          ? ("editionDone" as const)
          : ("tuningDone" as const);

      const currentMap =
        (((project as any)[mapKey] || {}) as Record<string, boolean>) ?? {};
      const nextMap: Record<string, boolean> = { ...currentMap };

      instruments.forEach((name) => {
        const k = String(name || "").trim();
        if (k) nextMap[k] = true;
      });

      const prevChecklist = (project.checklist ?? {}) as any;

      const nextProject: Project = {
        ...project,
        [mapKey]: nextMap as any,
        checklist: { ...prevChecklist, [section]: true },
        updatedAt: Date.now(),
      } as any;

      (nextProject as any).progress = computeProgress(nextProject as any);
      (nextProject as any).status = computeStatus(nextProject as any);
await updateProject(nextProject);
await refresh();
}

if (!project) {
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.h1}>Detalles</Text>
      <Text style={styles.muted}>No se encontró el proyecto.</Text>
      <View style={{ height: 12 }} />
      <PrimaryButton label="Back" onPress={goBackToHome} />
    </ScrollView>
  );
}

// 🔥 A partir de aquí project ya está garantizado
const { status, title: projectTitle, artist } = project;

const isArchived = status === "ARCHIVO";

const title = projectTitle || "Detalles";

const artistShown =
  artistDisplayName?.trim() || artist || "";







    // 💵 Cobro local
    const cost =
    billing?.total_cost === null || billing?.total_cost === undefined
      ? null
      : Number(billing.total_cost);

  const paid =
    billing?.paid === null || billing?.paid === undefined
      ? null
      : Number(billing.paid);

  const liquidadoLocal =
    billing?.remaining !== null &&
    billing?.remaining !== undefined &&
    Number(billing.remaining) <= 0;


    // 🧮 Progreso (todas las secciones marcadas)

    // 💸 Cobro real Supabase
    const remainingSupabase =
  typeof billing?.remaining === "number"
    ? billing.remaining
    : null;


  const fullyPaid =
    typeof remainingSupabase === "number"
      ? remainingSupabase <= 0
      : false;





    const canCloseByRules = canCloseProject(project as any);
  const blockingReasons = canCloseByRules
    ? []
    : getClosureBlockingReasons(project as any);

  // regla final (incluye cobro)
  const canClose = canCloseByRules && fullyPaid;
  const canLiquidarYCerrar = canCloseByRules && !fullyPaid;



    return (
      <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.projectHeader}>
  <Text style={styles.projectTitle}>
    {title}
  </Text>

  {artistShown ? (
    <Text style={styles.projectArtist}>
      {artistShown}
    </Text>
  ) : null}
</View>



        <Card title="Progreso">
          <ProgressBar value={project.progress || 0} tone={fullyPaid ? "green" : "blue"} />
        </Card>


  {quickFeedback && (
    <View
      style={{
        marginTop: 8,
        padding: 8,
        borderRadius: 8,
        backgroundColor:
          quickFeedback.type === "success"
            ? "rgba(60,190,90,0.15)"
            : quickFeedback.type === "error"
            ? "rgba(220,60,60,0.15)"
            : "rgba(0,0,0,0.08)",
      }}
    >
      <Text style={{ fontWeight: "700" }}>
        {quickFeedback.text}
      </Text>
    </View>
  )}


        <Card title="Secciones">
          <View style={{ gap: 10, marginTop: 8 }}>
            {ORDER.map((key) => {
              const done = !!project.checklist?.[key];

              if (TOGGLES.includes(key)) {
                return (
                  <Pressable
                    key={key}
                    onPress={() => toggleChecklist(key)}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 14,
                      paddingHorizontal: 16,
                      backgroundColor: done
                        ? "rgba(60, 190, 90, 0.1)"
                        : "rgba(0,0,0,0.04)",
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <Text style={styles.rowText}>{LABEL[key]}</Text>
                    <Text style={{ fontWeight: "900", opacity: 0.8 }}>
                      {done ? "✓" : "○"}
                    </Text>
                  </Pressable>
                );
              }

              return (
                <PrimaryButton
                  key={key}
                  label={`${LABEL[key]}${done ? " ✓" : ""}`}
                  tone={done ? "green" : "blue"}
                  onPress={() => goSection(key as DeepSection)}
                  onLongPress={() => markSectionDeep(key as DeepSection)}
                />
              );
            })}

            <PrimaryButton label="Cobro" onPress={goPayment} />
          </View>

          <Text style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
            Tip: Mantén presionado Músicos / Edición / Afinación para marcar todo.
          </Text>
        </Card>

        <Card>
          <Pressable
            onPress={() => setOpenCobro((v) => !v)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
            hitSlop={10}
          >
            <Text style={{ fontSize: 16, fontWeight: "800" }}>Cobro (resumen)</Text>
            <Text style={{ fontWeight: "900", opacity: 0.7 }}>
              {openCobro ? "▼" : "▶"}
            </Text>
          </Pressable>

          {openCobro ? (
            <View style={{ gap: 6, marginTop: 10 }}>
              <Text style={styles.rowText}>
    Costo (local): {cost === null ? "-" : `$${cost}`}
  </Text>

  <Text style={styles.rowText}>
    Pagado (local): {paid === null ? "-" : `$${paid}`}
  </Text>

  <Text style={styles.rowText}>
    Liquidado: {liquidadoLocal ? "Sí" : "No"}
  </Text>


              <Text style={styles.rowText}>
                Pendiente (Supabase):{" "}
                {billingLoading
                  ? "Cargando..."
                  : remainingSupabase === null
                  ? "-"
                  : `$${remainingSupabase}`}
              </Text>

              <Text style={styles.rowText}>
                Liquidado (Supabase):
  {billingLoading
    ? "Cargando..."
    : remainingSupabase === null
    ? "-"
    : remainingSupabase <= 0
    ? "Sí"
    : "No"}

              </Text>

              <Pressable onPress={goPayment} hitSlop={10}>
                <Text style={styles.rowText} numberOfLines={2}>
                  Notas: {artistNote?.trim() ? artistNote : "-"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Text style={[styles.rowText, { opacity: 0.65, marginTop: 8 }]}>
              Toca para ver detalles.
            </Text>
          )}
        </Card>

        <Card title="Acciones">
          <PrimaryButton label="Back" onPress={goBackToHome} />

  {!isArchived && (
    <PrimaryButton
      label="Cerrar Tema"
      tone="green"
      onPress={async () => {
        if (!project) return;
        const p = project;


        await archiveProject(project.id);
        goBackToHome();
      }}
    />
  )}



          <PrimaryButton label="Borrar Tema" tone="red" onPress={removeProject} />
        </Card>
  <Card title="Resumen">
    {/* Estado general */}
    <Text style={{ fontWeight: "900", fontSize: 15 }}>
      {canCloseByRules && fullyPaid
        ? "🟢 Tema listo para cerrar"
        : !canCloseByRules
        ? "🟡 Tema en proceso"
        : "🔴 Bloqueado por cobro"}
    </Text>

    

    {/* Pendientes principales (producción) */}
    {!canCloseByRules && blockingReasons.length > 0 && (
      <View style={{ marginTop: 6 }}>
        {blockingReasons.slice(0, 3).map((r, i) => (
          <Text key={i} style={{ opacity: 0.8, fontWeight: "700" }}>
            • {r}
          </Text>
        ))}
        {blockingReasons.length > 3 && (
          <Text style={{ opacity: 0.6, fontSize: 12, marginTop: 2 }}>
            …y más pendientes abajo
          </Text>
        )}
      </View>
    )}

    {/* Pendiente de cobro */}
    {!fullyPaid && (
      <Text style={{ marginTop: 6, opacity: 0.85, fontWeight: "700" }}>
        💸 Cobro pendiente
      </Text>
    )}

    {/* Siguiente acción sugerida */}
    <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
      {canCloseByRules && fullyPaid
        ? "👉 Acción disponible: Cerrar Tema"
        : !canCloseByRules
        ? "👉 Revisa los pendientes de producción"
        : "👉 Registra el pago para poder cerrar"}
    </Text>
  </Card>

        <View style={{ height: 30 }} />
        
      </ScrollView>
      
    );

    
  }

  const styles = StyleSheet.create({
  wrap: { padding: 16, paddingTop: 14, gap: 12 },

  projectHeader: {
    marginBottom: 12,
  },

  projectTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.5,
    color: "#111",
  },

  projectArtist: {
    fontSize: 15,
    fontWeight: "700",
    marginTop: 3,
    opacity: 0.6,
  },

  muted: { opacity: 0.65 },
  rowText: { fontWeight: "800", opacity: 0.9 },
});

