"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Info, X } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { corCategoria, iconeCategoria } from "../../lib/categorias";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normKey(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

// Busca TODAS as linhas de uma coluna, contornando o limite padrão de 1000
// linhas por requisição do Supabase, paginando em blocos.
async function buscarColunaCompleta(tabela, coluna) {
  const PAGINA = 1000;
  let inicio = 0;
  let tudo = [];
  while (true) {
    const { data, error } = await supabase
      .from(tabela)
      .select(coluna)
      .range(inicio, inicio + PAGINA - 1);
    if (error || !data) break;
    tudo = tudo.concat(data);
    if (data.length < PAGINA) break;
    inicio += PAGINA;
  }
  return tudo;
}

export default function ConsultaPecasPage() {
  const [termo, setTermo] = useState("");
  const [margem, setMargem] = useState(30);
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [totalGeral, setTotalGeral] = useState(0);
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from("pecas").select("*", { count: "exact", head: true });
      setTotalGeral(count || 0);

      const linhas = await buscarColunaCompleta("pecas", "categoria");
      const contagem = {};
      linhas.forEach((r) => { contagem[r.categoria] = (contagem[r.categoria] || 0) + 1; });
      setCategorias(Object.entries(contagem).sort((a, b) => a[0].localeCompare(b[0])));

      const { data: log } = await supabase
        .from("pecas_processamentos")
        .select("processado_em, total_registros, perfis(nome)")
        .order("processado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (log) setUltimaAtualizacao(log);
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

  function limparPesquisa() {
    setTermo("");
    setCategoriaAtiva(null);
  }

  const temFiltro = termo || categoriaAtiva;

  return (
    <AppShell titulo="Consulta de Peças">
      <div className="card p-4 mb-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex-1 min-w-[260px] relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              className="field-input pl-10 pr-9"
              placeholder="Ex: bateria sm-g — combina termos em qualquer campo"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
            />
            {termo && (
              <button
                onClick={() => setTermo("")}
                aria-label="Limpar texto"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {temFiltro && (
            <button onClick={limparPesquisa} className="btn-secondary text-xs py-2">
              <X size={13} />
              Limpar pesquisa
            </button>
          )}

          {perfil?.cargo !== "Cliente" && (
            <div
              className="flex items-center gap-2 border border-line rounded-[10px] px-3.5 py-2.5"
              style={{ background: "var(--surface)", boxShadow: "0 1px 0 rgba(0,0,0,0.05), 0 2px 4px rgba(20,24,31,0.06)" }}
            >
              <label className="text-xs text-muted whitespace-nowrap">Margem</label>
              <input
                type="number"
                className="w-14 bg-transparent outline-none font-semibold text-right"
                style={{ color: "var(--accent)" }}
                value={margem}
                onChange={(e) => setMargem(parseFloat(e.target.value) || 0)}
              />
              <span className="text-xs text-muted">%</span>
            </div>
          )}

          <div className="tooltip-trigger">
            <span
              className="w-9 h-9 flex items-center justify-center rounded-full border border-line cursor-default transition"
              style={{ background: "var(--surface)", color: "var(--accent)", boxShadow: "0 1px 0 rgba(0,0,0,0.05), 0 2px 4px rgba(20,24,31,0.06)" }}
            >
              <Info size={15} />
            </span>
            <div className="tooltip-bubble">
              {totalGeral.toLocaleString("pt-BR")} peças cadastradas no total
              {ultimaAtualizacao && (
                <>
                  <br />
                  Atualizada em {new Date(ultimaAtualizacao.processado_em).toLocaleDateString("pt-BR")} às{" "}
                  {new Date(ultimaAtualizacao.processado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {ultimaAtualizacao.perfis?.nome ? ` por ${ultimaAtualizacao.perfis.nome}` : ""}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mt-3">
          <button
            onClick={() => setCategoriaAtiva(null)}
            className={`chip ${!categoriaAtiva ? "chip-active" : ""}`}
          >
            Todas
          </button>
          {categorias.map(([cat, n]) => {
            const Icone = iconeCategoria(cat);
            const cor = corCategoria(cat);
            const ativo = categoriaAtiva === cat;
            return (
              <button
                key={cat}
                onClick={() => setCategoriaAtiva(cat === categoriaAtiva ? null : cat)}
                className={`chip ${ativo ? "chip-active" : ""}`}
              >
                <Icone size={13} className="chip-icone" style={{ color: ativo ? "#FFFFFF" : cor.fg }} />
                {cat} ({n})
              </button>
            );
          })}
        </div>

        {buscando && <p className="text-xs text-muted mt-2">buscando...</p>}
        {!buscando && temFiltro && (
          <p className="text-xs text-muted mt-2">{resultados.length.toLocaleString("pt-BR")} resultado(s)</p>
        )}
      </div>

      <div className="card overflow-hidden">
        {linhas.length === 0 ? (
          <div className="text-center py-16 text-muted text-sm">
            {temFiltro ? "Nenhuma peça encontrada para essa busca." : "Digite um ou mais termos para buscar em código, descrição, peça ou modelo."}
          </div>
        ) : (
          <div className="max-h-[calc(100vh-280px)] overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5 z-10">Modelo</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5 z-10">Categoria</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5 z-10">Código</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5 z-10">Descrição resumida</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5 z-10">Descrição da peça</th>
                  {perfil?.cargo !== "Cliente" && (
                    <th className="sticky top-0 bg-canvas text-right px-4 py-2.5 z-10">Custo</th>
                  )}
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5 z-10">Venda sugerida</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => {
                  const cor = corCategoria(r.categoria);
                  const Icone = iconeCategoria(r.categoria);
                  return (
                    <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas">
                      <td className="px-4 py-2.5 font-mono font-medium">{r.modelo}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: cor.bg, color: cor.fg }}>
                          <Icone size={11} />
                          {r.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "var(--accent)" }}>{r.codigo}</td>
                      <td className="px-4 py-2.5">{r.descricao_resumida}</td>
                      <td className="px-4 py-2.5 text-muted text-xs max-w-[240px]">{r.descricao_peca}</td>
                      {perfil?.cargo !== "Cliente" && (
                        <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(r.valor_unitario)}</td>
                      )}
                      <td className="px-4 py-2.5 text-right font-mono font-semibold text-success">{fmtBRL(r.venda)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
