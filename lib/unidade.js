const CHAVE = "unidade_ativa";

export function getUnidadeAtiva() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CHAVE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setUnidadeAtiva(unidade) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, JSON.stringify(unidade));
}

export function limparUnidadeAtiva() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CHAVE);
}

// Retorna as unidades ativas às quais o usuário tem acesso, via perfis_unidades.
export async function buscarUnidadesDoUsuario(supabase, perfilId) {
  const { data } = await supabase
    .from("perfis_unidades")
    .select("unidades(id, nome, asc_cod, ativo)")
    .eq("perfil_id", perfilId);
  return (data || [])
    .map((v) => v.unidades)
    .filter((u) => u && u.ativo);
}
