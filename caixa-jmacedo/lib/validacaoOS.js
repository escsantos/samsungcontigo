// Regra do número da OS (definida pelo Grupo J.Macedo):
// - 10 caracteres no total
// - só números: completa com zeros à esquerda até 10 dígitos (ex: 4176109477)
// - ou no formato "O-00000015" / "V-00000015" (prefixo + hífen + 8 dígitos)
// - qualquer outro formato alfanumérico é inválido

const REGEX_PREFIXO = /^[OV]-\d{8}$/;

export const REGRA_OS_TEXTO =
  'O número da OS deve ter 10 caracteres: só números (ex: 4176109477) ou no formato "O-00000015" / "V-00000015".';

/**
 * Recebe o texto digitado e devolve { valido, valor, erro }.
 * `valor` já vem formatado (zeros à esquerda aplicados) quando válido.
 */
export function normalizarNumeroOS(entrada) {
  const texto = (entrada || "").trim().toUpperCase();
  if (!texto) return { valido: false, valor: "", erro: "Informe o número da OS." };

  // formato com prefixo O- ou V-
  if (texto.includes("-")) {
    if (REGEX_PREFIXO.test(texto)) {
      return { valido: true, valor: texto, erro: null };
    }
    return { valido: false, valor: texto, erro: REGRA_OS_TEXTO };
  }

  // formato só números — completa com zero à esquerda até 10 dígitos
  if (/^\d+$/.test(texto)) {
    if (texto.length > 10) {
      return { valido: false, valor: texto, erro: REGRA_OS_TEXTO };
    }
    const valorPadronizado = texto.padStart(10, "0");
    // números que começam com "417" são do sistema de origem e já vêm com
    // os 10 dígitos completos — não pode faltar dígito e "virar" 0417...
    if (valorPadronizado.startsWith("0417")) {
      return {
        valido: false,
        valor: texto,
        erro: 'Números de OS que começam com "417" precisam ter os 10 dígitos completos (sem completar com zero à esquerda).',
      };
    }
    return { valido: true, valor: valorPadronizado, erro: null };
  }

  return { valido: false, valor: texto, erro: REGRA_OS_TEXTO };
}
