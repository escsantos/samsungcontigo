export const CARGOS = ["Administrador", "Diretor", "Gerente", "Vendedor", "Estoque", "Financeiro", "Cliente"];

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

export function sugerirLoginCliente(dados) {
  let base;
  if (dados.tipo_pessoa === "juridica") {
    base = dados.contato_responsavel || dados.nome_fantasia || dados.nome;
  } else {
    base = dados.nome;
  }
  const partes = String(base || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const nome = partes[0];
  const sobrenome = partes.length > 1 ? partes[partes.length - 1] : partes[0];
  return normalizarLogin(nome, sobrenome);
}
