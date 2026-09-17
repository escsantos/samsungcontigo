// Venda = Custo ÷ (1 − margem − imposto), ambos em fração da venda.
// Dedução: Venda - Custo - (imposto% × Venda) = margem% × Venda
export function calcularPreco(custo, margemPct, impostoPct) {
  if (custo === null || custo === undefined || isNaN(custo)) {
    return { venda: null, imposto: null, lucroLiquido: null };
  }
  const divisor = 1 - margemPct / 100 - impostoPct / 100;
  if (divisor <= 0) {
    // margem + imposto somam 100% ou mais: matematicamente indefinido
    return { venda: null, imposto: null, lucroLiquido: null };
  }
  const venda = custo / divisor;
  const imposto = venda * (impostoPct / 100);
  const lucroLiquido = venda - custo - imposto;
  return { venda, imposto, lucroLiquido };
}

export function corMargem(margemPct) {
  if (margemPct >= 30) return { cor: "#3FA796", label: "Margem saudável" };
  if (margemPct >= 20) return { cor: "#E8A33D", label: "Margem no limite" };
  return { cor: "#E1614F", label: "Margem baixa" };
}
