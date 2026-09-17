import { Tv, Smartphone, WashingMachine, Refrigerator, AirVent, Flame, Laptop, Package } from "lucide-react";

export const CORES_CATEGORIA = {
  DTV: { bg: "rgba(74,144,217,0.14)", fg: "#2E6DA8" },
  Celulares: { bg: "rgba(176,132,232,0.14)", fg: "#7A4FB0" },
  WSM: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  REF: { bg: "rgba(139,195,74,0.14)", fg: "#5A8A2E" },
  ACN: { bg: "rgba(88,183,214,0.14)", fg: "#2E7F97" },
  CKT: { bg: "rgba(201,123,74,0.14)", fg: "#9C5A34" },
  NPC: { bg: "rgba(99,102,241,0.14)", fg: "#4338CA" },
  Outros: { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" }
};

export const ICONES_CATEGORIA = {
  DTV: Tv,
  Celulares: Smartphone,
  WSM: WashingMachine,
  REF: Refrigerator,
  ACN: AirVent,
  CKT: Flame,
  NPC: Laptop,
  Outros: Package
};

export function corCategoria(cat) {
  return CORES_CATEGORIA[cat] || CORES_CATEGORIA.Outros;
}

export function iconeCategoria(cat) {
  return ICONES_CATEGORIA[cat] || ICONES_CATEGORIA.Outros;
}
