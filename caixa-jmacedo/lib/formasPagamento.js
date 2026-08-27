export const FORMAS_PAGAMENTO = ["PIX", "DÉBITO", "CRÉDITO", "DINHEIRO", "BOLETO", "LINK DE PAGAMENTO"];
export const BANDEIRAS = ["VISA", "MASTERCARD", "ELO", "OUTRA"];

export function precisaParcelas(forma) {
  return forma === "CRÉDITO" || forma === "LINK DE PAGAMENTO";
}

export function precisaBandeira(forma) {
  return forma === "CRÉDITO" || forma === "LINK DE PAGAMENTO" || forma === "DÉBITO";
}
