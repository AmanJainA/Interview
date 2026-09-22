import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Every table lives under the "interview" schema, so every
// query goes through this helper instead of supabase.from(...)
export const db = (table) => supabase.schema('interview').from(table);

// Same idea for calling the interview.* Postgres functions
// (register_user / login_user) that handle auth without
// touching Supabase's built-in `auth` schema at all.
export const rpc = (fn, params) => supabase.schema('interview').rpc(fn, params);
