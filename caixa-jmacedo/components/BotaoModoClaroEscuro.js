"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { carregarModo, salvarModo, aplicarModo } from "../lib/tema";

export default function BotaoModoClaroEscuro({ recolhido, topbar }) {
  const [modo, setModo] = useState("claro");

  useEffect(() => {
    setModo(carregarModo());
  }, []);

  function alternar() {
    const novo = modo === "claro" ? "escuro" : "claro";
    setModo(novo);
    salvarModo(novo);
    aplicarModo(novo);
  }

  if (topbar) {
    return (
      <button
        onClick={alternar}
        title={modo === "claro" ? "Modo escuro" : "Modo claro"}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas hover:text-ink transition"
      >
        {modo === "claro" ? <Moon size={17} /> : <Sun size={17} />}
      </button>
    );
  }

  return (
    <button
      onClick={alternar}
      title={recolhido ? (modo === "claro" ? "Modo escuro" : "Modo claro") : undefined}
      className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/10 hover:text-white transition ${recolhido ? "justify-center" : ""}`}
    >
      {modo === "claro" ? <Moon size={16} strokeWidth={2} className="shrink-0" /> : <Sun size={16} strokeWidth={2} className="shrink-0" />}
      {!recolhido && (modo === "claro" ? "Modo escuro" : "Modo claro")}
    </button>
  );
}
