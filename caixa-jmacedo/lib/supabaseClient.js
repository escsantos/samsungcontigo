import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Login usa o padrão nome.sobrenome. Internamente isso vira um e-mail
// fixo (nome.sobrenome@jmacedo.internal) só para o Supabase Auth aceitar,
// o usuário nunca digita e-mail.
export function loginParaEmail(login) {
  return `${login.trim().toLowerCase()}@jmacedo.internal`;
}
