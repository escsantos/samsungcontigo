// Cor e ícone animado de cada unidade, lembrando a cidade / região (mesmo visual do Sistema de Inventário, 10/11/2026).
import { Plane, TrainFront, Ship, Mountain, Sailboat, Wheat, Building2, Flower2, ShoppingBag, Flag, TreePine, Landmark, Cookie } from "lucide-react";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

// palavra no nome ou na cidade → visual
// (as mais específicas primeiro: os shoppings de Campinas antes da regra "CAMPINAS")
const REGRAS = [
  { chave: "MORUMBI", icone: ShoppingBag, anim: "inv-pula", cores: ["#B5306B", "#F28CB8"], regiao: "Morumbi Shopping · Zona Sul · São Paulo" },
  { chave: "INTERLAGOS", icone: Flag, anim: "inv-balanco", cores: ["#C0392B", "#F08A7E"], regiao: "Shopping Interlagos · Zona Sul · Autódromo" },
  { chave: "DOM PEDRO", icone: TreePine, anim: "inv-balanco", cores: ["#2E8B57", "#7ED6A4"], regiao: "Parque Dom Pedro · Campinas" },
  { chave: "IGUATEMI", icone: Landmark, anim: "inv-flutua", cores: ["#3730A3", "#818CF8"], regiao: "Iguatemi · Campinas" },
  { chave: "FERRAZ", icone: Flower2, anim: "inv-gira-lento", cores: ["#C2410C", "#FB923C"], regiao: "Alto Tietê · Ferraz de Vasconcelos" },
  { chave: "CAMPINAS", icone: Plane, anim: "inv-voo", cores: ["#0369A1", "#38BDF8"], regiao: "Região de Campinas" },
  { chave: "MIGUEL", icone: TrainFront, anim: "inv-caminhao", cores: ["#7A4FB0", "#C4A5F0"], regiao: "Zona Leste · São Paulo" },
  { chave: "SANTOS", icone: Ship, anim: "inv-balanco", cores: ["#0E7C86", "#5CC8D0"], regiao: "Baixada Santista · Porto" },
  { chave: "TABOAO", icone: Mountain, anim: "inv-flutua", cores: ["#15803D", "#4ADE80"], regiao: "Grande São Paulo · Serra" },
  { chave: "DUTRA", icone: Sailboat, anim: "inv-balanco", cores: ["#143F8C", "#4FA3F7"], regiao: "Zona Sul · Guarapiranga" },
  { chave: "MARILIA", icone: Cookie, anim: "inv-pula", cores: ["#0F766E", "#2DD4BF"], regiao: "Interior · Capital Nacional do Alimento" },
  { chave: "RIBEIRAO", icone: Wheat, anim: "inv-balanco", cores: ["#B45309", "#FBBF24"], regiao: "Interior · Agro" }
];
const PALETA = [["#C2410C", "#FB923C"], ["#B5306B", "#F28CB8"], ["#3730A3", "#818CF8"], ["#0F766E", "#2DD4BF"], ["#475569", "#94A3B8"]];

export function visualUnidade(u) {
  const texto = `${norm(u?.nome)} ${norm(u?.cidade)}`;
  const r = REGRAS.find((x) => texto.includes(x.chave));
  if (r) return r;
  const h = [...texto].reduce((t, c) => t + c.charCodeAt(0), 0);
  return { icone: Building2, anim: "inv-flutua", cores: PALETA[h % PALETA.length], regiao: u?.cidade || "" };
}

export function tipoDaUnidade(u) {
  if (u?.tipo && u.tipo !== "OUTRA") return u.tipo;
  const n = norm(u?.nome);
  if (n.startsWith("INSS")) return "InSS";
  return ["CSP", "MSC", "ESC"].find((t) => n.startsWith(t)) || "";
}
