import { supabase } from "../lib/supabase";
import { createProjectPayment } from "../storage/db/payments";

export type FinancialSnapshot = {
  totalCost: number;
  paid: number;
  remaining: number;
};

export async function projectFinancials(
  projectUuid: string
): Promise<FinancialSnapshot> {

  const { data, error } = await supabase
    .from("project_billing_summary")
    .select("project_id,total_cost,paid,remaining")
    .eq("project_id", projectUuid)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return {
      totalCost: 0,
      paid: 0,
      remaining: 0,
    };
  }

  return {
    totalCost: Number(data.total_cost ?? 0),
    paid: Number(data.paid ?? 0),
    remaining: Number(data.remaining ?? 0),
  };
}

export async function applyProjectPayment(
  projectUuid: string,
  amount: number
) {
  if (!amount || amount <= 0) return;

  const { error } = await supabase
    .from("project_payments")
    .insert({
      project_id: projectUuid,
      amount,
    });

  if (error) {
    throw error;
  }
}

