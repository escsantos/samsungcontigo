// Modo claro/escuro — simples, salvo por navegador (localStorage).
const CHAVE = "caixa-jmacedo:modo";

export function carregarModo() {
  if (typeof window === "undefined") return "claro";
  return window.localStorage.getItem(CHAVE) || "claro";
}

export function salvarModo(modo) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE, modo);
}

export function aplicarModo(modo) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", modo);
}
