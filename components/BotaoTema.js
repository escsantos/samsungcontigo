"use client";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function BotaoTema({ className = "" }) {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    setEscuro(document.documentElement.classList.contains("dark"));
  }, []);

  function alternar() {
    const novo = !escuro;
    setEscuro(novo);
    document.documentElement.classList.toggle("dark", novo);
    try { localStorage.setItem("tema", novo ? "dark" : "light"); } catch (e) {}
  }

  return (
    <button
      onClick={alternar}
      aria-label={escuro ? "Ativar modo claro" : "Ativar modo escuro"}
      className={`w-9 h-9 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink hover:border-brand-400 transition ${className}`}
    >
      {escuro ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
