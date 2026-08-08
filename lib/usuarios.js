export const CARGOS = ["Administrador", "Diretor", "Gerente", "Vendedor", "Estoque", "Cliente"];

export const SENHA_INICIAL = "samsungcontigo001";

export function normalizarLogin(nome, sobrenome) {
  const limpa = (s) =>
    String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "");
  return `${limpa(nome)}.${limpa(sobrenome)}`;
}
