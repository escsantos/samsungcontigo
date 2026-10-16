"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

// Caixa de seleção suspensa com várias opções marcáveis (16/10/2026).
// valor = array de ids marcados; vazio = "todos".
export default function MultiSelect({ opcoes, valor, onChange, rotuloTodos = "Todos", rotuloItem = "selecionado(s)", className = "", largura = "w-56" }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function fora(e) { if (ref.current && !ref.current.contains(e.target)) setAberto(false); }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const marcados = valor || [];
  const texto = marcados.length === 0
    ? rotuloTodos
    : marcados.length === 1
      ? (opcoes.find((o) => o.id === marcados[0])?.nome || `1 ${rotuloItem}`)
      : `${marcados.length} ${rotuloItem}`;

  function alternar(id) {
    onChange(marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id]);
  }

  const visiveis = busca.trim()
    ? opcoes.filter((o) => o.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : opcoes;

  return (
    <div ref={ref} className={`relative ${largura} ${className}`}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="field-input py-1.5 text-xs w-full flex items-center justify-between gap-2 text-left"
        style={marcados.length > 0 ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
      >
        <span className="truncate">{texto}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {aberto && (
        <div className="absolute z-40 mt-1 w-full min-w-[220px] card p-1.5 shadow-xl max-h-72 overflow-auto">
          {opcoes.length > 8 && (
            <input
              autoFocus
              className="field-input py-1 text-xs mb-1.5"
              placeholder="Buscar..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          )}
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-canvas flex items-center gap-2"
          >
            <span className="w-4 h-4 rounded border border-line flex items-center justify-center shrink-0" style={marcados.length === 0 ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : undefined}>
              {marcados.length === 0 && <Check size={11} />}
            </span>
            <b>{rotuloTodos}</b>
          </button>
          {visiveis.map((o) => {
            const m = marcados.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => alternar(o.id)}
                className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-canvas flex items-center gap-2"
              >
                <span className="w-4 h-4 rounded border border-line flex items-center justify-center shrink-0" style={m ? { background: "var(--accent)", borderColor: "var(--accent)", color: "#fff" } : undefined}>
                  {m && <Check size={11} />}
                </span>
                <span className="truncate">{o.nome}</span>
              </button>
            );
          })}
          {visiveis.length === 0 && <p className="text-xs text-muted px-2 py-1.5">Nada encontrado.</p>}
        </div>
      )}
    </div>
  );
}
