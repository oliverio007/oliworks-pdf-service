// src/dev/testers.ts
import { Alert } from "react-native";
import { supabase } from "../lib/supabase";

import { forceResyncProjectsHard } from "../storage/db";


import { aiAsk } from "../api/aiAsk";

function toNum(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

function getBaseUrl() {
  return (
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    "https://aegvmikadhlhhknzwidu.supabase.co"
  );
}

function getAnonKey() {
  return process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
}

async function getUserTokenOrAlert(tag: string) {
  const anon = getAnonKey();
  if (!anon) {
    Alert.alert(tag, "Missing EXPO_PUBLIC_SUPABASE_ANON_KEY");
    return { token: "", anon: "" };
  }

  const { data: s1, error: e1 } = await supabase.auth.getSession();
  if (e1) {
    Alert.alert(tag, `getSession error: ${e1.message}`);
    return { token: "", anon: "" };
  }

  let token = s1.session?.access_token;

  if (!token) {
    const { data: s2, error: e2 } = await supabase.auth.refreshSession();
    if (e2) {
      Alert.alert(tag, `refreshSession error: ${e2.message}`);
      return { token: "", anon: "" };
    }
    token = s2.session?.access_token ?? undefined;
  }

  if (!token) {
    Alert.alert(tag, "No hay sesión/token. Inicia sesión primero.");
    return { token: "", anon: "" };
  }

  return { token, anon };
}

// --------------------
// TESTERS
// --------------------

export async function testAiAsk() {
  try {
    const r = await aiAsk("Dame 3 prioridades para hoy en OliWorks.");
    Alert.alert("ai-ask (OK)", String(r?.answer ?? "").slice(0, 900));
  } catch (e: any) {
    Alert.alert("ai-ask (ERROR)", e?.message ?? String(e));
  }
}

export async function testForceResyncProjects() {
  try {
    const merged = await forceResyncProjectsHard();
    Alert.alert("OK", `Resync duro listo. Projects: ${merged.length}`);
  } catch (e: any) {
    Alert.alert("Resync duro ERROR", e?.message ?? String(e));
  }
}


export async function testProjectsSummary() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;

    if (!token) {
      Alert.alert("Sin sesión", "Primero inicia sesión en la app.");
      return;
    }

    const base =
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      "https://aegvmikadhlhhknzwidu.supabase.co";

    const anon = getAnonKey();
    if (!anon) {
      Alert.alert("Falta ANON KEY", "No existe EXPO_PUBLIC_SUPABASE_ANON_KEY en tu env.");
      return;
    }

    const url = `${base}/functions/v1/projects-summary`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });

    const text = await res.text();
    let payload: any = text;
    try {
      payload = JSON.parse(text);
    } catch {}

    Alert.alert(
      `projects-summary (${res.status})`,
      typeof payload === "string"
        ? payload.slice(0, 900)
        : JSON.stringify(payload, null, 2).slice(0, 900)
    );
  } catch (e: any) {
    Alert.alert("Error projects-summary", e?.message ?? String(e));
  }
}

export async function testProjectsQuery() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;

    if (!token) {
      Alert.alert("Sin sesión", "Primero inicia sesión en la app.");
      return;
    }

    const base =
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      "https://aegvmikadhlhhknzwidu.supabase.co";

    const anon = getAnonKey();
    if (!anon) {
      Alert.alert("Falta ANON KEY", "No existe EXPO_PUBLIC_SUPABASE_ANON_KEY en tu env.");
      return;
    }

    const url = `${base}/functions/v1/projects-query`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ intent: "LIST_IN_PROCESS", limit: 50 }),
    });

    const text = await res.text();
    let payload: any = text;
    try {
      payload = JSON.parse(text);
    } catch {}

    Alert.alert(
      `projects-query (${res.status})`,
      typeof payload === "string"
        ? payload.slice(0, 900)
        : JSON.stringify(payload, null, 2).slice(0, 900)
    );
  } catch (e: any) {
    Alert.alert("Error projects-query", e?.message ?? String(e));
  }
}

export async function testArtistProgress(artistName: string) {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;

    if (!token) {
      Alert.alert("Sin sesión", "Primero inicia sesión en la app.");
      return;
    }

    const base =
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      "https://aegvmikadhlhhknzwidu.supabase.co";

    const anon = getAnonKey();
    if (!anon) {
      Alert.alert("Falta ANON KEY", "No existe EXPO_PUBLIC_SUPABASE_ANON_KEY en tu env.");
      return;
    }

    const url = `${base}/functions/v1/artist-progress?artist_name=${encodeURIComponent(
      artistName
    )}`;

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });

    const text = await res.text();
    let payload: any = text;
    try {
      payload = JSON.parse(text);
    } catch {}

    Alert.alert(
      `artist-progress (${res.status})`,
      typeof payload === "string"
        ? payload.slice(0, 900)
        : JSON.stringify(payload, null, 2).slice(0, 900)
    );
  } catch (e: any) {
    Alert.alert("Error artist-progress", e?.message ?? String(e));
  }
}



export async function testWalletSummary() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    let token = data.session?.access_token;
    if (!token) {
      const { data: s2, error: e2 } = await supabase.auth.refreshSession();
      if (e2) throw e2;
      token = s2.session?.access_token ?? undefined;
    }

    const anonKey = getAnonKey();

    if (!token) {
      Alert.alert("wallet-summary", "No hay access_token. Re-login.");
      return;
    }

    const parts = token.split(".");
    if (parts.length !== 3) {
      Alert.alert("wallet-summary", `El token NO parece JWT (parts=${parts.length}).`);
      return;
    }

    const baseUrl = getBaseUrl();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (anonKey) headers["apikey"] = anonKey;

    const urlProjects = `${baseUrl}/functions/v1/projects-summary2`;
    const urlWallet = `${baseUrl}/functions/v1/wallet-summary2`;

    const [resP, resW] = await Promise.all([
      fetch(urlProjects, { method: "GET", headers }),
      fetch(urlWallet, { method: "GET", headers }),
    ]);

    const textW = await resW.text();

    if (resW.status === 200) {
      let jsonW: any = {};
      try {
        jsonW = JSON.parse(textW);
      } catch {}

      Alert.alert(
        "wallet-summary ✅",
        `status: ${resW.status}\nmovements: ${
          jsonW?.window?.movements_count ?? jsonW?.movements_count ?? "?"
        }\n` +
          `anticipos: ${jsonW?.totals?.anticipos ?? "?"}\n` +
          `aplicado: ${jsonW?.totals?.aplicado ?? "?"}\n` +
          `disponibles: ${jsonW?.totals?.disponibles ?? "?"}`
      );
    } else {
      Alert.alert(
        "wallet-summary ❌",
        `projects: ${resP.status}\nwallet: ${resW.status}\n${textW.slice(0, 220)}`
      );
    }
  } catch (e: any) {
    Alert.alert("wallet-summary ERROR", String(e?.message ?? e));
  }
}

export async function testProjectFinancials() {
  try {
    const baseUrl = getBaseUrl();
    const { token } = await getUserTokenOrAlert("project-financials");
    if (!token) return;

    const res = await fetch(
      `${baseUrl}/functions/v1/project-financials?only_unpaid=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          ...(getAnonKey() ? { apikey: getAnonKey() } : {}),
        },
      }
    );

    const json = await res.json().catch(() => ({}));
    if (res.status !== 200 || !json?.ok) {
      Alert.alert(
        "project-financials",
        `status: ${res.status}\n${JSON.stringify(json).slice(0, 220)}`
      );
      return;
    }

    const top = (json.top_unpaid_projects ?? json.items ?? []).slice(0, 3);
    const lines = top.map((p: any, i: number) => {
      const title = p.title ?? "Sin título";
      const pendiente = p.pendiente_cobro ?? "?";
      const aplicado = p.aplicado_sum ?? "?";
      return `${i + 1}) ${title}\n   pendiente: ${pendiente} | aplicado: ${aplicado}`;
    });

    Alert.alert(
      "project-financials ✅",
      `status: 200 | count: ${json.count}\n\nTop pendientes:\n${lines.join("\n\n")}`
    );
  } catch (e: any) {
    Alert.alert("project-financials", String(e?.message ?? e));
  }
}

export async function testArtistsFinancials3() {
  try {
    const baseUrl = getBaseUrl();
    const { token, anon } = await getUserTokenOrAlert("artists-financials3");
    if (!token) return;

    const url =
      `${baseUrl}/functions/v1/artists-financials3` +
      `?top=7&include_projects=1&projects_preview=5&limit_wallet=5000&limit_projects=5000&debug=1`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
        "X-OliWorks-Client": "DevPanel-testArtistsFinancials3",
      },
    });

    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      Alert.alert("artists-financials3 ❌", `status: ${res.status}\n${JSON.stringify(json)}`);
      return;
    }

    const items: any[] = Array.isArray(json)
      ? json
      : Array.isArray(json.items)
        ? json.items
        : [];

    const count = Array.isArray(json)
      ? json.length
      : Number.isFinite(Number(json.count))
        ? Number(json.count)
        : items.length;

    const lines: string[] = [];
    lines.push(`status: ${res.status} | count: ${count}`);
    lines.push("");
    lines.push("Top:");

    items.slice(0, 3).forEach((it, idx) => {
      const name = String(it.display_name ?? it.artist_id ?? "UNKNOWN");
      const pendiente = toNum(it.pendiente);
      const aplicado = toNum(it.aplicado_sum);
      const disponible = toNum(it.disponible);
      const projectsCnt = toNum(it.projects_cnt);

      const titles = Array.isArray(it.projects)
        ? it.projects
            .map((p: any) => String(p.title ?? ""))
            .filter(Boolean)
            .join(", ")
        : "";

      lines.push(
        `${idx + 1}) ${name}\n` +
          `pendiente: ${pendiente} | aplicado: ${aplicado}\n` +
          `disponible: ${disponible} | proyectos: ${projectsCnt}` +
          (titles ? `\nproyectos: ${titles}` : "")
      );
      lines.push("");
    });

    Alert.alert("artists-financials3 ✅", lines.join("\n"));
  } catch (e: any) {
    Alert.alert("artists-financials3", String(e?.message ?? e));
  }
}

export async function testWalletRLSDirect() {
  try {
    const { data: s, error: se } = await supabase.auth.getSession();
    if (se) throw se;
    if (!s.session) {
      Alert.alert("wallet RLS", "No hay sesión. Inicia sesión.");
      return;
    }

    const { data, error, count } = await supabase
      .from("wallet_movements")
      .select("id, kind, amount, artist_id, created_at", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      Alert.alert("wallet RLS ❌", `error: ${error.message}`);
      return;
    }

    Alert.alert(
      "wallet RLS ✅",
      `count: ${count ?? "?"}\nrows: ${(data?.length ?? 0)}\n` +
        (data?.[0]
          ? `first.kind=${data[0].kind} amount=${data[0].amount}`
          : "no rows")
    );
  } catch (e: any) {
    Alert.alert("wallet RLS", String(e?.message ?? e));
  }
}

export async function testDailyPlan() {
  try {
    const baseUrl = getBaseUrl();
    const { token, anon } = await getUserTokenOrAlert("daily-plan");
    if (!token) return;

    const url = `${baseUrl}/functions/v1/daily-plan?days=1&limit_events=50&limit_pendings=50&debug=1`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
        "X-OliWorks-Client": "DevPanel-testDailyPlan",
      },
    });

    const text = await res.text();
    let payload: any = text;
    try {
      payload = JSON.parse(text);
    } catch {}

    if (!res.ok) {
      Alert.alert(
        "daily-plan ❌",
        `status: ${res.status}\n` +
          (typeof payload === "string"
            ? payload.slice(0, 900)
            : JSON.stringify(payload, null, 2).slice(0, 900))
      );
      return;
    }

    const agendaCount = payload?.agenda?.count ?? payload?.agenda?.items?.length ?? 0;
    const openPend = payload?.pendings?.open ?? 0;
    const donePend = payload?.pendings?.done ?? 0;

    const nextType = payload?.suggested_next?.type ?? "none";
    const nextLabel =
      nextType === "event"
        ? payload?.suggested_next?.title
        : nextType === "pending"
          ? payload?.suggested_next?.text
          : "N/A";

    Alert.alert(
      "daily-plan ✅",
      `status: ${res.status}\nagenda: ${agendaCount}\npendings: open ${openPend} | done ${donePend}\n` +
        `suggested_next: ${nextType}\n${String(nextLabel ?? "").slice(0, 120)}`
    );
  } catch (e: any) {
    Alert.alert("Error daily-plan", e?.message ?? String(e));
  }
}
export async function testAiRouter() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;

    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";
    const base =
      process.env.EXPO_PUBLIC_SUPABASE_URL ??
      "https://aegvmikadhlhhknzwidu.supabase.co";

    if (!token) return Alert.alert("ai-router", "Sin sesión. Inicia sesión primero.");
    if (!anon) return Alert.alert("ai-router", "Falta EXPO_PUBLIC_SUPABASE_ANON_KEY");

    const res = await fetch(`${base}/functions/v1/ai-router`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, apikey: anon },
    });

    const text = await res.text();
    let payload: any = text;
    try { payload = JSON.parse(text); } catch {}

    Alert.alert(
      `ai-router (${res.status})`,
      typeof payload === "string"
        ? payload.slice(0, 900)
        : JSON.stringify(payload, null, 2).slice(0, 900)
    );
  } catch (e: any) {
    Alert.alert("ai-router ERROR", e?.message ?? String(e));
  }
}

// ✅ IMPORTANTE: si ya tienes export default, agrégalo aquí
export default {
  testAiAsk,
  testAiRouter,
  testProjectsSummary,
  testForceResyncProjects, // 👈 ESTE
  testProjectsQuery,
  testWalletSummary,
  testProjectFinancials,
  testArtistsFinancials3,
  testDailyPlan,
  testWalletRLSDirect,
};


