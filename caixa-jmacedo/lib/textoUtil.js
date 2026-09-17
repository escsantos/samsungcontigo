// Remove acentos para gerar login/e-mail válidos (ex: "Lourenço" -> "lourenco").
// O nome exibido na tela continua acentuado normalmente — isso só afeta
// o identificador técnico (login) e o e-mail interno usado no Supabase Auth.
export function semAcento(texto) {
  return (texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "");
}

export function gerarLogin(nome, sobrenome) {
  return `${semAcento(nome)}.${semAcento(sobrenome)}`.toLowerCase();
}
