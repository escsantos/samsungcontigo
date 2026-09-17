"use client";
import { useEffect, useRef, useState } from "react";
import { Wand2, Check, Undo2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

// Temas visuais disponíveis. "original" não sobrepõe nada — o sistema volta
// a obedecer o modo claro/escuro e a cor de destaque escolhidos normalmente.
export const TEMAS_VISUAIS = [
  { id: "original", nome: "Original (J.Macedo)", desc: "O padrão da casa — logo cinza, escrita azul.", swatch: "linear-gradient(135deg,#4A90D9,#2E6DA8)" },
  { id: "dos", nome: "Retrô DOS / Clipper", desc: "Fundo preto, fósforo verde — nostalgia dos anos 80.", swatch: "#000000" },
  { id: "criancas", nome: "Mês das Crianças", desc: "Cores vivas, balões e brinquedos.", swatch: "linear-gradient(135deg,#FF9F45,#FF6B9D)" },
  { id: "natal", nome: "Natal", desc: "Vermelho, verde e dourado, com neve caindo.", swatch: "linear-gradient(135deg,#B3141F,#1B5E3A)" }
];

// Aplica o tema visual na tag <html> (atributo data-tema-visual, lido pelo
// globals.css) e guarda no localStorage pra já nascer aplicado no próximo
// carregamento, antes do perfil terminar de chegar (mesmo padrão do modo
// claro/escuro em app/layout.js).
export function aplicarTemaVisual(tema) {
  const html = document.documentElement;
  if (!tema || tema === "original") {
    html.removeAttribute("data-tema-visual");
  } else {
    html.setAttribute("data-tema-visual", tema);
  }
  try { localStorage.setItem("tema_visual", tema || "original"); } catch (e) {}
}

export default function SeletorTema({ perfil, onChange }) {
  const [aberto, setAberto] = useState(false);
  const [temaAtivo, setTemaAtivo] = useState("original");
  const ref = useRef(null);

  useEffect(() => {
    setTemaAtivo(perfil?.tema_visual || "original");
  }, [perfil?.tema_visual]);

  useEffect(() => {
    function fora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  async function escolher(temaId) {
    setTemaAtivo(temaId);
    aplicarTemaVisual(temaId);
    onChange?.(temaId);
    setAberto(false);
    if (perfil?.id) {
      await supabase.from("perfis").update({ tema_visual: temaId }).eq("id", perfil.id);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Tema do sistema"
        title="Tema do sistema"
        className="w-9 h-9 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink transition"
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
      >
        <Wand2 size={16} />
      </button>

      {aberto && (
        <div className="absolute right-0 top-11 z-40 card p-4 w-72 shadow-2xl">
          <p className="font-display font-semibold text-[14px] mb-1">Tema do sistema</p>
          <p className="text-xs text-muted mb-3">Escolha um tema — fica salvo no seu perfil.</p>

          <div className="space-y-1.5">
            {TEMAS_VISUAIS.map((t) => {
              const ativo = temaAtivo === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => escolher(t.id)}
                  className="w-full flex items-center gap-2.5 p-2 rounded-lg border text-left transition"
                  style={{
                    borderColor: ativo ? "var(--accent)" : "var(--line)",
                    background: ativo ? "var(--accent-soft)" : "transparent"
                  }}
                >
                  <span className="w-6 h-6 rounded-md shrink-0" style={{ background: t.swatch, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium truncate">{t.nome}</span>
                    <span className="block text-[10.5px] text-muted truncate">{t.desc}</span>
                  </span>
                  {ativo && <Check size={15} style={{ color: "var(--accent)" }} className="shrink-0" />}
                </button>
              );
            })}
          </div>

          {temaAtivo !== "original" && (
            <button
              onClick={() => escolher("original")}
              className="w-full flex items-center justify-center gap-1.5 mt-2.5 p-2 rounded-lg border border-dashed border-line text-[11.5px] font-medium text-muted hover:text-ink transition"
            >
              <Undo2 size={12} />
              Voltar ao tema original
            </button>
          )}
        </div>
      )}
    </div>
  );
}
