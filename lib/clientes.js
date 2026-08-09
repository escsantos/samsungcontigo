export function apenasNumeros(v) {
  return String(v || "").replace(/\D/g, "");
}

export function validarCPF(valor) {
  const cpf = apenasNumeros(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let soma = 0;
  for (let i = 0; i < 9; i++) soma += parseInt(cpf[i]) * (10 - i);
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[9])) return false;
  soma = 0;
  for (let i = 0; i < 10; i++) soma += parseInt(cpf[i]) * (11 - i);
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(cpf[10])) return false;
  return true;
}

export function validarCNPJ(valor) {
  const cnpj = apenasNumeros(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calcularDigito = (base) => {
    let tamanho = base.length;
    let pos = tamanho - 7;
    let soma = 0;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(base.charAt(tamanho - i)) * pos--;
      if (pos < 2) pos = 9;
    }
    const resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
    return resultado;
  };
  const d1 = calcularDigito(cnpj.substring(0, 12));
  if (d1 !== parseInt(cnpj.charAt(12))) return false;
  const d2 = calcularDigito(cnpj.substring(0, 13));
  if (d2 !== parseInt(cnpj.charAt(13))) return false;
  return true;
}

export function formatarCPF(valor) {
  const v = apenasNumeros(valor).slice(0, 11);
  return v
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function formatarCNPJ(valor) {
  const v = apenasNumeros(valor).slice(0, 14);
  return v
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function formatarTelefone(valor) {
  const v = apenasNumeros(valor).slice(0, 11);
  if (v.length <= 10) {
    return v
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d{1,4})$/, "$1-$2");
  }
  return v
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d{1,4})$/, "$1-$2");
}

export function formatarCEP(valor) {
  const v = apenasNumeros(valor).slice(0, 8);
  return v.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
}

export async function buscarCEP(cep) {
  const limpo = apenasNumeros(cep);
  if (limpo.length !== 8) return null;
  try {
    const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
    const dados = await resp.json();
    if (dados.erro) return null;
    return {
      logradouro: dados.logradouro || "",
      bairro: dados.bairro || "",
      cidade: dados.localidade || "",
      estado: dados.uf || ""
    };
  } catch (e) {
    return null;
  }
}

export const ESTADOS_BR = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"
];

export const CATEGORIAS_CLIENTE = ["Revenda", "Assistência Técnica", "Consumidor Final", "Atacado"];

export const CONDICOES_PAGAMENTO = ["À vista", "Boleto 30 dias", "Boleto 30/60 dias", "Boleto 30/60/90 dias", "Cartão de crédito", "PIX"];

export const ORIGENS_CLIENTE = ["Indicação", "Loja física", "Site", "Redes sociais", "Outro"];
