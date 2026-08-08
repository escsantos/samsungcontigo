"use client";
import { useEffect, useRef, useState } from "react";
import { Palette, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

const PRESETS = [
  { nome: "Azul J.Macedo", accent: "#4A90D9", dark: "#2E6DA8" },
  { nome: "Verde", accent: "#3FA796", dark: "#2C7C6E" },
  { nome: "Roxo", accent: "#8B5CF6", dark: "#6D3FD1" },
  { nome: "Laranja", accent: "#E8A33D", dark: "#C2801F" },
  { nome: "Vermelho", accent: "#E1614F", dark: "#B8402F" },
  { nome: "Ciano", accent: "#06B6D4", dark: "#0891A8" }
];

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function escurecer(hex, quantidade = 0.3) {
  const h = hex.replace("#", "");
  const r = Math.round(parseInt(h.substring(0, 2), 16) * (1 - quantidade));
  const g = Math.round(parseInt(h.substring(2, 4), 16) * (1 - quantidade));
  const b = Math.round(parseInt(h.substring(4, 6), 16) * (1 - quantidade));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

export function aplicarAccent(accent, dark) {
  const root = document.documentElement;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-dark", dark || escurecer(accent));
  root.style.setProperty("--accent-soft", hexToRgba(accent, 0.12));
}

export default function SeletorCor({ perfil, onChange }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function fora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  async function escolher(preset) {
    aplicarAccent(preset.accent, preset.dark);
    setAberto(false);
    if (perfil?.id) {
      await supabase.from("perfis").update({ cor_accent: preset.accent }).eq("id", perfil.id);
    }
    onChange?.(preset.accent);
  }

  const atual = perfil?.cor_accent || "#4A90D9";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Cor do sistema"
        className="w-9 h-9 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink transition"
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
      >
        <Palette size={16} />
      </button>
      {aberto && (
        <div className="absolute right-0 top-11 z-40 card p-4 w-64 shadow-xl">
          <p className="font-display font-semibold text-sm mb-1">Cor do sistema</p>
          <p className="text-xs text-muted mb-3">Escolha a cor de destaque usada em botões, links e filtros.</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.nome}
                onClick={() => escolher(p)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-canvas transition"
                title={p.nome}
              >
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                  style={{ background: p.accent, borderColor: atual === p.accent ? "var(--ink)" : "transparent" }}
                >
                  {atual === p.accent && <Check size={14} color="#fff" />}
                </span>
                <span className="text-[10px] text-muted text-center leading-tight">{p.nome}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
