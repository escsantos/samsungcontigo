import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Login no padrão nome.sobrenome -> email interno usado só pelo Supabase Auth.
// Ajuste o domínio abaixo se quiser manter o mesmo padrão usado no Caixa Online.
export function loginParaEmail(login) {
  return `${String(login).trim().toLowerCase()}@pecas.jmacedo.internal`;
}

export async function getPerfilAtual() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("perfis")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) return null;
  return data;
}
