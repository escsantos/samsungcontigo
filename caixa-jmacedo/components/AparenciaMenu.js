"use client";
import { useState } from "react";
import { Palette, Check, Minus, Plus, RotateCcw } from "lucide-react";
import Modal from "./Modal";
import {
  TEMAS,
  FONTES,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_PASSO,
  ZOOM_PADRAO,
  carregarPreferencia,
  salvarPreferencia,
  aplicarPreferencia,
} from "../lib/aparencia";

const CORES_SWATCH = {
  dourado: "#B8862E",
  "azul-claro": "#2E6DA8",
  "azul-escuro": "#3B5FA0",
  "verde-claro": "#3F8A5C",
  "amarelo-claro": "#C9A227",
  "rosa-bebe": "#D97AA0",
  "azul-bebe": "#6FA8D6",
  "lilas-claro": "#9B7BC9",
};

export default function AparenciaMenu() {
  const [aberto, setAberto] = useState(false);
  const [pref, setPref] = useState(() => carregarPreferencia() || { tema: "dourado", fonte: "padrao", zoom: ZOOM_PADRAO });

  function atualizar(novo) {
    const combinado = { ...pref, ...novo };
    setPref(combinado);
    salvarPreferencia(combinado);
    aplicarPreferencia(combinado);
  }

  function restaurarPadrao() {
    atualizar({ tema: "dourado", fonte: "padrao", zoom: ZOOM_PADRAO });
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white transition"
      >
        <Palette size={16} strokeWidth={2} className="shrink-0" />
        Aparência
      </button>

      {aberto && (
        <Modal titulo="Aparência" subtitulo="Personalize as cores, a fonte e o zoom do sistema" onFechar={() => setAberto(false)}>
          <div className="space-y-6">
            <div>
              <p className="field-label mb-2">Tema de cor</p>
              <div className="grid grid-cols-4 gap-2">
                {TEMAS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => atualizar({ tema: t.id })}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 transition ${
                      pref.tema === t.id ? "border-gold bg-gold-soft/40" : "border-line hover:border-gold/50"
                    }`}
                  >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ background: CORES_SWATCH[t.id] }}
                    >
                      {pref.tema === t.id && <Check size={14} className="text-white" />}
                    </span>
                    <span className="text-[11px] text-center leading-tight">{t.nome}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="field-label mb-2">Fonte</p>
              <div className="grid grid-cols-2 gap-2">
                {FONTES.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => atualizar({ fonte: f.id })}
                    className={`text-left rounded-lg border px-3 py-2 text-sm transition ${
                      pref.fonte === f.id ? "border-gold bg-gold-soft/40 font-medium" : "border-line hover:border-gold/50"
                    }`}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="field-label mb-2">Zoom</p>
              <div className="flex items-center gap-3">
                <button
                  className="btn w-9 h-9 p-0"
                  onClick={() => atualizar({ zoom: Math.max(ZOOM_MIN, (pref.zoom || ZOOM_PADRAO) - ZOOM_PASSO) })}
                >
                  <Minus size={16} />
                </button>
                <span className="font-mono-num text-sm w-12 text-center">{pref.zoom || ZOOM_PADRAO}%</span>
                <button
                  className="btn w-9 h-9 p-0"
                  onClick={() => atualizar({ zoom: Math.min(ZOOM_MAX, (pref.zoom || ZOOM_PADRAO) + ZOOM_PASSO) })}
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <button className="btn text-sm flex items-center gap-1.5" onClick={restaurarPadrao}>
                <RotateCcw size={14} /> Restaurar padrão
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
