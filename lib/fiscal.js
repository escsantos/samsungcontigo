// Regras do módulo Fiscal (Nota Fiscal por pedido).
//
// A emissão da NF fica liberada a partir do momento em que o Faturamento foi
// efetuado — não é obrigatória pra avançar o pedido, só um registro/controle.
// O controle de pendências (pedidos liberados sem NF) só vale pras unidades
// marcadas como obrigadas a emitir Nota Fiscal (unidades.obriga_nota_fiscal).

// Status em que já dá pra registrar a NF do pedido.
export const STATUS_ELEGIVEIS_NF = ["Faturamento Efetuado", "Liberado para Retirada/Entrega"];

// Status considerado "liberado" pro controle de pendência de NF.
export const STATUS_LIBERADO = "Liberado para Retirada/Entrega";

// Quem enxerga o menu/dashboard Fiscal e o alerta de pendências. O Vendedor só
// vê o que é dele (a RLS de "ver orcamentos" já restringe pelo vendedor_id).
export const CARGOS_FISCAL = ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque", "Financeiro", "Vendedor"];

// Quem consegue de fato registrar/corrigir a NF do pedido (bate com a policy
// pode_gerenciar_fiscal() do banco).
export const CARGOS_GERENCIA_FISCAL = ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque", "Financeiro"];

// "emitida" | "marcada_depois" | "pendente"
export function statusNotaFiscal(orcamento) {
  if (orcamento?.nota_fiscal_numero) return "emitida";
  if (orcamento?.nota_fiscal_emitir_depois) return "marcada_depois";
  return "pendente";
}

export const RESUMO_STATUS_NF = {
  emitida: { texto: "NF emitida", bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  marcada_depois: { texto: "Emitir depois", bg: "rgba(232,163,61,0.14)", fg: "#C2801F" },
  pendente: { texto: "Sem NF", bg: "var(--danger-soft)", fg: "var(--danger)" }
};

// Um pedido entra no controle de "falta emitir" quando: a unidade exige NF,
// o pedido já foi liberado pra retirada/entrega, não está cancelado, e ainda
// não tem número de NF registrado (independente de estar marcado "emitir depois").
export function faltaEmitirNF(orcamento, unidadeObrigaNF) {
  return !!unidadeObrigaNF && orcamento.status === STATUS_LIBERADO && !orcamento.nota_fiscal_numero;
}
