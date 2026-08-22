import { supabase } from "./supabaseClient";
import { getUnidadeAtiva } from "./unidade";

// Registra um evento de auditoria. Nunca trava a ação principal — se falhar,
// só avisa no console, não interrompe o fluxo do usuário.
export async function registrarAuditoria({ tipoEvento, entidade, entidadeId, descricao, dadosAntes, dadosDepois, usuarioId, unidadeId }) {
  try {
    let uid = usuarioId;
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser();
      uid = user?.id || null;
    }
    const unidadeAtiva = getUnidadeAtiva();
    await supabase.from("auditoria_logs").insert({
      tipo_evento: tipoEvento,
      entidade,
      entidade_id: entidadeId !== undefined && entidadeId !== null ? String(entidadeId) : null,
      usuario_id: uid,
      unidade_id: unidadeId !== undefined ? unidadeId : (unidadeAtiva?.id ?? null),
      descricao,
      dados_antes: dadosAntes || null,
      dados_depois: dadosDepois || null
    });
  } catch (e) {
    console.error("[auditoria] falha ao registrar:", e);
  }
}

export const TIPOS_EVENTO = [
  "login", "logout", "criacao", "edicao", "exclusao", "status", "bloqueio", "desbloqueio", "senha", "pagamento"
];
