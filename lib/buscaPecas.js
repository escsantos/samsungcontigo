// Busca de peças (13/11/2026): usa a função buscar_pecas_filtro, que filtra no
// banco ANTES de calcular preço/Delivery (bem mais rápida). Se ela ainda não
// existir no banco (SQL de desempenho não rodado), cai na buscar_pecas antiga,
// com o mesmo resultado de sempre.
export async function buscarPecas(supabase, { unidadeId, termos = [], categoria = null, limite = 300 }) {
  const lista = (termos || []).map((t) => String(t || "").trim()).filter(Boolean);
  const { data, error } = await supabase.rpc("buscar_pecas_filtro", {
    p_unidade_id: unidadeId,
    p_termos: lista,
    p_categoria: categoria || null,
    p_limite: limite
  });
  if (!error) return { data: data || [], error: null };

  let q = supabase.rpc("buscar_pecas", { p_unidade_id: unidadeId }).order("modelo").limit(limite);
  if (categoria) q = q.eq("categoria", categoria);
  lista.forEach((t) => {
    const like = `%${t}%`;
    q = q.or(`modelo.ilike.${like},codigo.ilike.${like},descricao_resumida.ilike.${like},descricao_peca.ilike.${like}`);
  });
  const r = await q;
  return { data: r.data || [], error: r.error || null };
}
