// Presets de "Aparência" — 8 temas de cor, 8 combinações de fonte, zoom.
// Aplicados via CSS custom properties em :root (ver globals.css).

export const TEMAS = [
  { id: "dourado", nome: "Dourado Clássico" },
  { id: "azul-claro", nome: "Azul Claro" },
  { id: "azul-escuro", nome: "Azul Escuro" },
  { id: "verde-claro", nome: "Verde Claro" },
  { id: "amarelo-claro", nome: "Amarelo Claro" },
  { id: "rosa-bebe", nome: "Rosa Bebê" },
  { id: "azul-bebe", nome: "Azul Bebê" },
  { id: "lilas-claro", nome: "Lilás Claro" },
];

// cada preset aponta para as variáveis de fonte já carregadas em layout.js
export const FONTES = [
  { id: "padrao", nome: "Padrão", display: "var(--font-space-grotesk)", body: "var(--font-inter)", mono: "var(--font-ibm-plex-mono)" },
  { id: "moderno", nome: "Moderno", display: "var(--font-poppins)", body: "var(--font-inter)", mono: "var(--font-ibm-plex-mono)" },
  { id: "executivo", nome: "Executivo", display: "var(--font-montserrat)", body: "var(--font-manrope)", mono: "var(--font-ibm-plex-mono)" },
  { id: "editorial", nome: "Editorial", display: "var(--font-merriweather)", body: "var(--font-lora)", mono: "var(--font-ibm-plex-mono)" },
  { id: "amigavel", nome: "Amigável", display: "var(--font-nunito)", body: "var(--font-nunito)", mono: "var(--font-jetbrains-mono)" },
  { id: "tecnico", nome: "Técnico", display: "var(--font-sora)", body: "var(--font-work-sans)", mono: "var(--font-jetbrains-mono)" },
  { id: "classico", nome: "Clássico", display: "var(--font-lora)", body: "var(--font-merriweather)", mono: "var(--font-ibm-plex-mono)" },
  { id: "compacto", nome: "Compacto", display: "var(--font-work-sans)", body: "var(--font-inter)", mono: "var(--font-jetbrains-mono)" },
];

export const ZOOM_MIN = 85;
export const ZOOM_MAX = 130;
export const ZOOM_PASSO = 10;
export const ZOOM_PADRAO = 100;

export const CHAVE_LOCALSTORAGE = "caixa-jmacedo:aparencia";

export function carregarPreferencia() {
  if (typeof window === "undefined") return null;
  try {
    const salvo = window.localStorage.getItem(CHAVE_LOCALSTORAGE);
    return salvo ? JSON.parse(salvo) : null;
  } catch {
    return null;
  }
}

export function salvarPreferencia(pref) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHAVE_LOCALSTORAGE, JSON.stringify(pref));
}

export function aplicarPreferencia(pref) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", pref.tema || "dourado");
  root.style.fontSize = `${pref.zoom || ZOOM_PADRAO}%`;

  const fonte = FONTES.find((f) => f.id === (pref.fonte || "padrao")) || FONTES[0];
  root.style.setProperty("--font-display", fonte.display);
  root.style.setProperty("--font-body", fonte.body);
  root.style.setProperty("--font-mono", fonte.mono);
}
