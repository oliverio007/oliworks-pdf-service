// src/storage/client.ts

import { createClient } from "@supabase/supabase-js";

// ⚠️ Usa variables públicas en Expo / React Native
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default supabase;
