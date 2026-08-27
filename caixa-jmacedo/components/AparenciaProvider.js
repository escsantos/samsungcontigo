"use client";
import { useEffect } from "react";
import { carregarPreferencia, aplicarPreferencia } from "../lib/aparencia";

// Componente "invisível": só aplica no <html> o tema/fonte/zoom salvos
// pelo usuário (localStorage), assim que a página carrega.
export default function AparenciaProvider() {
  useEffect(() => {
    const pref = carregarPreferencia();
    if (pref) aplicarPreferencia(pref);
  }, []);
  return null;
}
