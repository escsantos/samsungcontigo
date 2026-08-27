import { Smartphone, Tv, Tablet, Watch, Laptop, Bot, Cable, Tag } from "lucide-react";

const ICONES = {
  celular: Smartphone,
  tv: Tv,
  tablet: Tablet,
  relógio: Watch,
  relogio: Watch,
  notebook: Laptop,
  robô: Bot,
  robo: Bot,
  acessório: Cable,
  acessorio: Cable,
};

export function iconeCategoria(nome) {
  return ICONES[(nome || "").toLowerCase()] || Tag;
}
