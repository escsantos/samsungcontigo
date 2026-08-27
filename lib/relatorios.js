// Regras do módulo Relatórios (Resumo de vendas por vendedor).
//
// O relatório considera só pedidos já ENTREGUES (orcamentos.entregue = true),
// usando a data de entrega (entregue_em) como referência de período — é o
// momento em que o custo real das peças (orcamento_itens.custo_real) já está
// todo registrado.

// Quem enxerga o menu/dashboard de Relatórios.
export const CARGOS_RELATORIOS = ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"];

// Quem consegue ver pedidos de TODOS os vendedores (com o seletor de
// vendedor). Vendedor só vê os próprios pedidos, sem seletor.
export const CARGOS_TODOS_VENDEDORES = ["Administrador", "Diretor", "Gerente", "Supervisor"];

// Semana sempre de domingo a sábado. Numeração no padrão "%U": os dias antes
// do primeiro domingo do ano contam como semana 0.
export function numeroSemana(data) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const inicioAno = new Date(d.getFullYear(), 0, 1);
  const dias = Math.floor((d - inicioAno) / 86400000);
  return Math.floor((dias + inicioAno.getDay()) / 7) + 1;
}

export function inicioSemana(data) {
  const d = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function fimSemana(data) {
  const ini = inicioSemana(data);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 6);
  fim.setHours(23, 59, 59, 999);
  return fim;
}

// Ex: "W34"
export function rotuloSemana(data) {
  const ini = inicioSemana(data);
  return `W${String(numeroSemana(ini)).padStart(2, "0")}`;
}

// Calcula as colunas financeiras de uma linha do Resumo a partir dos valores
// já apurados do pedido (valor pago, custo somado das peças, % de imposto do
// pedido e % de comissão do vendedor).
export function calcularLinhaResumo({ valorPago, custoPecas, impostoPct, comissaoPct }) {
  const vp = Number(valorPago || 0);
  const cp = Number(custoPecas || 0);
  const ip = Number(impostoPct || 0);
  const cmPct = Number(comissaoPct || 0);
  const valorImposto = vp * (ip / 100);
  const margemBruta = vp - (cp + valorImposto);
  const comissaoVendedor = vp * (cmPct / 100);
  const margemLiquida = margemBruta - comissaoVendedor;
  const lucroLiquidoPct = vp > 0 ? (margemLiquida / vp) * 100 : 0;
  return { valorImposto, margemBruta, comissaoVendedor, margemLiquida, lucroLiquidoPct };
}
