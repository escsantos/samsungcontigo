"use client";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";

const CORES_CATEGORIA = {
  DTV: { bg: "rgba(74,144,217,0.14)", fg: "#2E6DA8" },
  Celulares: { bg: "rgba(176,132,232,0.14)", fg: "#7A4FB0" },
  WSM: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  REF: { bg: "rgba(139,195,74,0.14)", fg: "#5A8A2E" },
  ACN: { bg: "rgba(88,183,214,0.14)", fg: "#2E7F97" },
  CKT: { bg: "rgba(201,123,74,0.14)", fg: "#9C5A34" },
  Outros: { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" }
};

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normKey(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export default function ConsultaPecasPage() {
  const [termo, setTermo] = useState("");
  const [margem, setMargem] = useState(30);
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [totalGeral, setTotalGeral] = useState(0);

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from("pecas").select("*", { count: "exact", head: true });
      setTotalGeral(count || 0);
      const { data } = await supabase.from("pecas").select("categoria");
      const contagem = {};
      (data || []).forEach((r) => { contagem[r.categoria] = (contagem[r.categoria] || 0) + 1; });
      setCategorias(Object.entries(contagem).sort((a, b) => a[0].localeCompare(b[0])));
    })();
  }, []);

  useEffect(() => {
    const termos = normKey(termo).split(/\s+/).filter(Boolean);
    if (termos.length === 0 && !categoriaAtiva) {
      setResultados([]);
      return;
    }
    const timer = setTimeout(async () => {
      setBuscando(true);
      let query = supabase.from("pecas").select("*").order("modelo").limit(300);
      if (categoriaAtiva) query = query.eq("categoria", categoriaAtiva);
      termos.forEach((t) => {
        const like = `%${t}%`;
        query = query.or(`modelo.ilike.${like},codigo.ilike.${like},descricao_resumida.ilike.${like},descricao_peca.ilike.${like}`);
      });
      const { data, error } = await query;
      setResultados(error ? [] : data);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [termo, categoriaAtiva]);

  const linhas = useMemo(() => {
    return resultados.map((r) => ({
      ...r,
      venda: r.valor_unitario !== null ? r.valor_unitario * (1 + margem / 100) : null
    }));
  }, [resultados, margem]);

  return (
    <AppShell titulo="Consulta de Peças">
      <div className="card p-5 mb-4">
        <div className="flex gap-3 flex-wrap items-center mb-4">
          <div className="flex-1 min-w-[260px] relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              className="field-input pl-10"
              placeholder="Ex: bateria sm-g — combina termos em qualquer campo"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 border border-line rounded-[10px] px-3.5 py-2.5">
            <label className="text-xs text-muted whitespace-nowrap">Margem</label>
            <input
              type="number"
              className="w-14 bg-transparent outline-none text-brand-500 font-semibold text-right"
              value={margem}
              onChange={(e) => setMargem(parseFloat(e.target.value) || 0)}
            />
            <span className="text-xs text-muted">%</span>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-2">
          <button
            onClick={() => setCategoriaAtiva(null)}
            className={`text-xs font-mono px-3 py-1.5 rounded-full border ${!categoriaAtiva ? "border-brand-400 text-brand-500 bg-brand-50" : "border-line text-muted"}`}
          >
            Todas
          </button>
          {categorias.map(([cat, n]) => (
            <button
              key={cat}
              onClick={() => setCategoriaAtiva(cat === categoriaAtiva ? null : cat)}
              className={`text-xs font-mono px-3 py-1.5 rounded-full border ${categoriaAtiva === cat ? "border-brand-400 text-brand-500 bg-brand-50" : "border-line text-muted"}`}
            >
              {cat} ({n})
            </button>
          ))}
        </div>

        <p className="text-xs text-muted">
          {totalGeral.toLocaleString("pt-BR")} peças cadastradas no total
          {buscando ? " · buscando..." : termo || categoriaAtiva ? ` · ${resultados.length.toLocaleString("pt-BR")} resultado(s)` : ""}
        </p>
      </div>

      <div className="card overflow-hidden">
        {linhas.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm">
            {termo || categoriaAtiva ? "Nenhuma peça encontrada para essa busca." : "Digite um ou mais termos para buscar em código, descrição, peça ou modelo."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Modelo</th>
                <th className="text-left px-4 py-2.5">Categoria</th>
                <th className="text-left px-4 py-2.5">Código</th>
                <th className="text-left px-4 py-2.5">Descrição resumida</th>
                <th className="text-left px-4 py-2.5">Descrição da peça</th>
                <th className="text-right px-4 py-2.5">Custo</th>
                <th className="text-right px-4 py-2.5">Venda sugerida</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => {
                const cor = CORES_CATEGORIA[r.categoria] || CORES_CATEGORIA.Outros;
                return (
                  <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5 font-mono font-medium">{r.modelo}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: cor.bg, color: cor.fg }}>
                        {r.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-brand-500">{r.codigo}</td>
                    <td className="px-4 py-2.5">{r.descricao_resumida}</td>
                    <td className="px-4 py-2.5 text-muted text-xs max-w-[240px]">{r.descricao_peca}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(r.valor_unitario)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-success">{fmtBRL(r.venda)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
