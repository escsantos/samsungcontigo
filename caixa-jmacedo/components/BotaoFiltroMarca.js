"use client";
import { useEffect, useRef, useState } from "react";
import { Building2, ChevronDown, Check } from "lucide-react";
import { useSessao } from "../lib/SessaoContext";

// cor de destaque por marca — só estética, cai num tom neutro se a marca
// não estiver na lista (qualquer marca nova já funciona sem configurar nada)
const CORES_MARCA = {
  CSP: "#2670B5",
  MSC: "#3F8A5C",
  ESC: "#9C5A34",
  INSS: "#7C56B5",
};
function corDaMarca(marca) {
  return CORES_MARCA[marca] || "#7C819C";
}

/**
 * Filtro de marca (CSP/MSC/ESC/INSS...), visível só para quem tem acesso a
 * mais de uma unidade. Seleção livre — pode combinar quantas marcas quiser;
 * nenhuma marcada = mostra todas.
 */
export default function BotaoFiltroMarca() {
  const { unidades, marcasFiltro, definirMarcasFiltro, marcasDisponiveis } = useSessao();
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function aoClicarFora(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAberto(false);
    }
    window.addEventListener("mousedown", aoClicarFora);
    return () => window.removeEventListener("mousedown", aoClicarFora);
  }, []);

  if (unidades.length <= 1 || marcasDisponiveis.length <= 1) return null;

  function alternar(marca) {
    definirMarcasFiltro(marcasFiltro.includes(marca) ? marcasFiltro.filter((m) => m !== marca) : [...marcasFiltro, marca]);
  }

  const rotulo = marcasFiltro.length === 0 ? "Todas as marcas" : marcasFiltro.join(" + ");

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        className={`group inline-flex items-center gap-2 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-medium
          border transition-all duration-200 shadow-sm
          ${marcasFiltro.length > 0
            ? "bg-gradient-to-b from-gold to-gold-strong border-transparent text-white shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(184,134,46,0.5)] hover:brightness-105 hover:-translate-y-0.5"
            : "bg-white border-line text-muted hover:border-gold/50 hover:text-gold-strong"
          }`}
      >
        <Building2 size={14} />
        <span className="max-w-[160px] truncate">{rotulo}</span>
        <ChevronDown size={13} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl2 shadow-2xl border border-line z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-line flex items-center justify-between">
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">Filtrar por marca</p>
            {marcasFiltro.length > 0 && (
              <button onClick={() => definirMarcasFiltro([])} className="text-[11px] text-gold-strong hover:underline">
                Limpar
              </button>
            )}
          </div>
          <div className="p-2 space-y-1.5">
            {marcasDisponiveis.map((marca) => {
              const marcado = marcasFiltro.includes(marca);
              const cor = corDaMarca(marca);
              return (
                <button
                  key={marca}
                  onClick={() => alternar(marca)}
                  className={`w-full flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-all
                    ${marcado ? "border-transparent" : "border-line hover:border-line/80 bg-white"}`}
                  style={
                    marcado
                      ? {
                          background: `linear-gradient(180deg, ${cor}22, ${cor}11)`,
                          boxShadow: `0 2px 0 0 ${cor}55, inset 0 1px 1px rgba(255,255,255,0.6)`,
                          borderColor: `${cor}55`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                    style={{
                      background: `radial-gradient(circle at 30% 25%, ${cor}, ${cor}CC 70%)`,
                      boxShadow: `0 2px 3px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.5)`,
                    }}
                  >
                    {marca.slice(0, 3)}
                  </span>
                  <span className="flex-1 text-left text-ink">{marca}</span>
                  {marcado && <Check size={15} style={{ color: cor }} />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
