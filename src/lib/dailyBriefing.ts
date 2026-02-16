import { supabase } from "./supabase";

export type DailyBriefingResult = {
  ok: true;
  cached: boolean;
  day: string;
  content: string;
  updated_at: string;
};

export async function getDailyBriefing(force = false): Promise<DailyBriefingResult | null> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;

  // 👇 Sin sesión = estado normal, no error
  if (!session) return null;

  const { data: res, error } = await supabase.functions.invoke("daily-briefing", {
    body: { force },
  });

  if (error) throw error;
  return res as DailyBriefingResult;
}
