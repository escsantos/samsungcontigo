// Formatação padrão do sistema: moeda em R$, datas em dd/mm/aaaa

export function formatarMoeda(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarMoedaSemSimbolo(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formato compacto para eixos de gráfico: 1580 -> "1,6K", 1250000 -> "1,3M"
export function formatarCompacto(valor) {
  const n = Number(valor) || 0;
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatarDataBR(isoDate) {
  if (!isoDate) return "";
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function mesReferenciaLabel(isoDate) {
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const d = new Date(isoDate + "T00:00:00");
  return `${meses[d.getMonth()]}/${d.getFullYear()}`;
}

// converte um valor digitado em centavos (string só de dígitos) para número decimal
export function centavosParaNumero(digitos) {
  const limpo = digitos.replace(/\D/g, "");
  return Number(limpo) / 100;
}
