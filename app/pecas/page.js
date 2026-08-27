"use client";
import { useEffect, useMemo, useState } from "react";
import { Search, Info, X, ShoppingCart, User2, Check } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { corCategoria, iconeCategoria } from "../../lib/categorias";
import { calcularPreco, corMargem } from "../../lib/precos";
import DetalhePecaModal from "../../components/DetalhePecaModal";
import Modal from "../../components/Modal";
import { useCarrinho } from "../../contexts/CarrinhoContext";
import { getUnidadeAtiva } from "../../lib/unidade";

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
  const [impostoTotal, setImpostoTotal] = useState(0);
  const [categoriaAtiva, setCategoriaAtiva] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [totalGeral, setTotalGeral] = useState(0);
  const [perfil, setPerfil] = useState(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(null);
  const [qtds, setQtds] = useState({});
  const [custosEditados, setCustosEditados] = useState({});
  const [pecaSelecionada, setPecaSelecionada] = useState(null);
  const [seletorClienteAberto, setSeletorClienteAberto] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [clientesEncontrados, setClientesEncontrados] = useState([]);
  const [itemAdicionado, setItemAdicionado] = useState(null);
  const [tooltipDesc, setTooltipDesc] = useState(null); // { texto, top, left }
  const [unidadeAtiva] = useState(() => getUnidadeAtiva());
  const carrinho = useCarrinho();

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  // Cliente logado: o carrinho já é dele automaticamente
  useEffect(() => {
    if (perfil?.cargo === "Cliente" && perfil.cliente_id && carrinho && carrinho.clienteId !== perfil.cliente_id) {
      carrinho.selecionarCliente(perfil.cliente_id, perfil.nome);
    }
  }, [perfil, carrinho]);

  useEffect(() => {
    if (!seletorClienteAberto) return;
    const t = setTimeout(async () => {
      const termoBusca = normKey(buscaCliente);
      let query = supabase.from("clientes").select("id, nome, nome_fantasia").eq("status", "Ativo").order("nome").limit(20);
      if (termoBusca) query = query.ilike("nome", `%${buscaCliente}%`);
      const { data } = await query;
      setClientesEncontrados(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [buscaCliente, seletorClienteAberto]);

  useEffect(() => {
    (async () => {
      const { count } = await supabase.from("pecas_catalogo").select("*", { count: "exact", head: true });
      setTotalGeral(count || 0);

      const linhas = await buscarColunaCompleta("pecas_catalogo", "categoria");
      const contagem = {};
      linhas.forEach((r) => { contagem[r.categoria] = (contagem[r.categoria] || 0) + 1; });
      setCategorias(Object.entries(contagem).sort((a, b) => a[0].localeCompare(b[0])));

      const { data: log } = await supabase
        .from("pecas_processamentos")
        .select("processado_em, total_registros, perfis(nome)")
        .eq("unidade_id", unidadeAtiva?.id)
        .order("processado_em", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (log) setUltimaAtualizacao(log);

      const { data: impostos } = await supabase.from("impostos").select("percentual, ativo").eq("unidade_id", unidadeAtiva?.id);
      const soma = (impostos || []).filter((i) => i.ativo).reduce((s, i) => s + Number(i.percentual), 0);
      setImpostoTotal(soma);
    })();
  }, []);

  useEffect(() => {
    const termos = normKey(termo).split(/\s+/).filter(Boolean);
    if (termos.length === 0 && !categoriaAtiva) {
      setResultados([]);
      return;
    }
    if (!unidadeAtiva) return;
    const timer = setTimeout(async () => {
      setBuscando(true);
      let query = supabase.rpc("buscar_pecas", { p_unidade_id: unidadeAtiva.id }).order("modelo").limit(300);
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
  }, [termo, categoriaAtiva, unidadeAtiva]);

  const margemEfetiva = perfil?.cargo === "Cliente" ? 30 : margem;

  const linhas = useMemo(() => {
    return resultados.map((r) => {
      const qtd = qtds[r.id] ?? 1;
      const custoUnit = custosEditados[r.id] !== undefined ? custosEditados[r.id] : r.valor_unitario;
      const { venda, imposto, lucroLiquido } = calcularPreco(custoUnit, margemEfetiva, impostoTotal);
      return {
        ...r,
        qtd,
        custoUnit,
        vendaUnit: venda,
        custoTotal: custoUnit !== null ? custoUnit * qtd : null,
        impostoTotal: imposto !== null ? imposto * qtd : null,
        lucroLiquidoTotal: lucroLiquido !== null ? lucroLiquido * qtd : null,
        vendaTotal: venda !== null ? venda * qtd : null
      };
    });
  }, [resultados, margemEfetiva, impostoTotal, qtds, custosEditados]);

  function mudarQtd(id, valor) {
    const n = Math.max(1, parseInt(valor, 10) || 1);
    setQtds((q) => ({ ...q, [id]: n }));
  }

  function mudarCusto(id, valor) {
    const n = parseFloat(valor);
    setCustosEditados((c) => ({ ...c, [id]: isNaN(n) ? 0 : n }));
  }

  function limparPesquisa() {
    setTermo("");
    setCategoriaAtiva(null);
  }

  function adicionarAoCarrinho(r, e) {
    e.stopPropagation();
    carrinho.adicionarItem({ ...r, valor_unitario: r.custoUnit }, r.qtd);
    setItemAdicionado(r.id);
    setTimeout(() => setItemAdicionado(null), 1200);
  }

  const staffPodeEscolherCliente = ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"].includes(perfil?.cargo);
  const podeComprar = staffPodeEscolherCliente || perfil?.cargo === "Cliente";
  const carrinhoPronto = podeComprar && !!carrinho?.clienteId;

  const temFiltro = termo || categoriaAtiva;
  const statusMargem = corMargem(margemEfetiva);
  const margemBaixa = margemEfetiva < 20;
  const mostraCusto = perfil?.cargo !== "Cliente";

  return (
    <AppShell titulo="Consulta de Peças">
      {staffPodeEscolherCliente && (
        <div className="card p-3.5 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 text-sm">
            <User2 size={16} style={{ color: "var(--accent)" }} />
            {carrinho?.clienteId ? (
              <span>Montando orçamento para: <b>{carrinho.clienteNome}</b></span>
            ) : (
              <span className="text-muted">Nenhum cliente selecionado — escolha um para poder adicionar peças ao carrinho.</span>
            )}
          </div>
          <div className="flex gap-2">
            {carrinho?.clienteId && (
              <button
                className="btn-secondary text-xs py-2 text-danger"
                onClick={() => {
                  carrinho.selecionarCliente(null, "");
                  limparPesquisa();
                }}
              >
                <X size={13} />
                Limpar cliente e pesquisa
              </button>
            )}
            <button className="btn-secondary text-xs py-2" onClick={() => setSeletorClienteAberto(true)}>
              {carrinho?.clienteId ? "Trocar cliente" : "Selecionar cliente"}
            </button>
          </div>
        </div>
      )}

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

          {mostraCusto && (
            <div
              className="flex items-center gap-2.5 border border-line rounded-[10px] px-3.5 py-2.5"
              style={{ background: "var(--surface)", boxShadow: "0 1px 0 rgba(0,0,0,0.05), 0 2px 4px rgba(20,24,31,0.06)" }}
              title={statusMargem.label}
            >
              <span
                className="w-3 h-3 rounded-full shrink-0"
                style={{
                  background: `radial-gradient(circle at 30% 30%, ${statusMargem.cor}, ${statusMargem.cor}dd)`,
                  boxShadow: `0 1px 2px rgba(0,0,0,0.3), 0 0 0 2px ${statusMargem.cor}33`
                }}
              />
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
              {mostraCusto && <><br />Imposto aplicado no cálculo: {impostoTotal.toFixed(2)}%</>}
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
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5 z-10" style={{ width: "12%" }}>Modelo</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5 z-10" style={{ width: "9%" }}>Categoria</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5 z-10" style={{ width: "11%" }}>Código</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5 z-10" style={{ width: mostraCusto ? "16%" : "38%" }}>Descrição</th>
                  <th className="sticky top-0 bg-canvas text-center px-3 py-2.5 z-10" style={{ width: "6%" }}>Qtd</th>
                  {mostraCusto && (
                    <>
                      <th className="sticky top-0 bg-canvas text-right px-3 py-2.5 z-10" style={{ width: "14%" }}>Custo</th>
                      <th className="sticky top-0 bg-canvas text-right px-3 py-2.5 z-10" style={{ width: "9%" }}>Imposto</th>
                      <th className="sticky top-0 bg-canvas text-right px-3 py-2.5 z-10" style={{ width: "9%" }}>Lucro</th>
                      <th className="sticky top-0 bg-canvas text-right px-3 py-2.5 z-10" style={{ width: "6%" }}>Marg.</th>
                    </>
                  )}
                  <th className="sticky top-0 bg-canvas text-right px-3 py-2.5 z-10" style={{ width: "12%" }}>
                    {mostraCusto ? "Venda Sugerida" : "Valor de Venda"}
                  </th>
                  {podeComprar && <th className="sticky top-0 bg-canvas text-center px-3 py-2.5 z-10" style={{ width: "6%" }}></th>}
                </tr>
              </thead>
              <tbody>
                {linhas.map((r) => {
                  const cor = corCategoria(r.categoria);
                  const Icone = iconeCategoria(r.categoria);
                  const corLinha = mostraCusto && margemBaixa ? "var(--danger)" : undefined;
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                      onClick={() => setPecaSelecionada(r)}
                    >
                      <td className="px-3 py-2.5 font-mono font-medium text-xs truncate">{r.modelo}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: cor.bg, color: cor.fg }}>
                          <Icone size={10} />
                          {r.categoria}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs truncate" style={{ color: "var(--accent)" }}>{r.codigo}</td>
                      <td className="px-3 py-2.5 text-xs truncate">
                        {r.descricao_peca ? (
                          <span
                            className="border-b border-dashed cursor-help"
                            style={{ borderColor: "var(--line)" }}
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltipDesc({ texto: r.descricao_peca, top: rect.bottom + 8, left: rect.left });
                            }}
                            onMouseLeave={() => setTooltipDesc(null)}
                          >
                            {r.descricao_resumida}
                          </span>
                        ) : (
                          r.descricao_resumida
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number"
                          min={1}
                          className="field-input py-1 px-1.5 text-center font-mono w-14 mx-auto"
                          value={r.qtd}
                          onChange={(e) => mudarQtd(r.id, e.target.value)}
                        />
                      </td>
                      {mostraCusto && (
                        <>
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center border border-line rounded-[8px] pl-2 bg-surface focus-within:border-brand-400" style={{ borderColor: "var(--line)" }}>
                              <span className="text-xs text-muted shrink-0">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                className="py-1 px-1.5 text-right font-mono w-full bg-transparent outline-none text-xs"
                                style={{ color: corLinha }}
                                value={r.custoUnit ?? ""}
                                onChange={(e) => mudarCusto(r.id, e.target.value)}
                                title="Custo editável — só vale pra este pedido, não altera a base de peças"
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: corLinha }}>{fmtBRL(r.impostoTotal)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: corLinha }}>{fmtBRL(r.lucroLiquidoTotal)}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-xs" style={{ color: corLinha || statusMargem.cor }}>{margemEfetiva}%</td>
                        </>
                      )}
                      <td
                        className="px-3 py-2.5 text-right font-mono font-semibold text-sm"
                        style={{ color: corLinha || "#2C7C6E" }}
                      >
                        {fmtBRL(r.vendaTotal)}
                      </td>
                      {podeComprar && (
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => adicionarAoCarrinho(r, e)}
                            disabled={!carrinhoPronto}
                            title={carrinhoPronto ? "Adicionar ao carrinho" : "Selecione um cliente primeiro"}
                            className="w-8 h-8 flex items-center justify-center rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{ color: itemAdicionado === r.id ? "#2C7C6E" : "var(--accent)" }}
                          >
                            {itemAdicionado === r.id ? <Check size={16} /> : <ShoppingCart size={16} />}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetalhePecaModal
        peca={pecaSelecionada}
        qtd={pecaSelecionada?.qtd ?? 1}
        mostraCusto={mostraCusto}
        unidadeAtivaId={unidadeAtiva?.id}
        unidadeAtivaAscCod={unidadeAtiva?.asc_cod}
        onClose={() => setPecaSelecionada(null)}
      />

      <Modal
        open={seletorClienteAberto}
        onClose={() => setSeletorClienteAberto(false)}
        title="Selecionar cliente"
      >
        <input
          className="field-input mb-3"
          placeholder="Buscar por nome..."
          value={buscaCliente}
          onChange={(e) => setBuscaCliente(e.target.value)}
          autoFocus
        />
        <div className="max-h-72 overflow-auto -mx-2">
          {clientesEncontrados.length === 0 ? (
            <p className="text-sm text-muted px-2 py-3">Nenhum cliente encontrado.</p>
          ) : (
            clientesEncontrados.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  carrinho.selecionarCliente(c.id, c.nome);
                  setSeletorClienteAberto(false);
                }}
                className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-canvas text-sm"
              >
                {c.nome} {c.nome_fantasia ? <span className="text-muted text-xs">({c.nome_fantasia})</span> : null}
              </button>
            ))
          )}
        </div>
      </Modal>

      {tooltipDesc && (
        <div
          className="fixed z-[999] max-w-xs px-3 py-2.5 rounded-lg text-xs leading-relaxed pointer-events-none"
          style={{ top: tooltipDesc.top, left: tooltipDesc.left, background: "var(--ink)", color: "var(--canvas)" }}
        >
          {tooltipDesc.texto}
        </div>
      )}
    </AppShell>
  );
}
