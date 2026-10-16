"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Download, Package, Boxes, Wallet, ClipboardList, X } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import CardStat from "../../components/CardStat";
import { getUnidadeAtiva } from "../../lib/unidade";
import { ORDEM_STATUS, CORES_STATUS, ICONES_STATUS } from "../../lib/estoque";
import { PERIODOS, calcularIntervalo } from "../../lib/periodo";
import { CARGOS_RELATORIO_PECAS, CARGOS_RELATORIO_PECAS_CUSTO } from "../../lib/relatorios";

// Vendas > Relatório de Peças (pedido 16/10/2026).
// Relação de todas as peças dos pedidos da unidade, com filtro por
// período, status (vários de uma vez), vendedor, cliente e busca por
// código/descrição. Dá pra agrupar por vendedor ou por cliente (com
// subtotal) e exportar exatamente o que está na tela para o Excel.

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtData(iso) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

const STATUS_OPCOES = [...ORDEM_STATUS, "Rejeitado", "Cancelado"];
const AGRUPAMENTOS = [
  { id: "nenhum", label: "Sem agrupar" },
  { id: "vendedor", label: "Por vendedor" },
  { id: "cliente", label: "Por cliente" }
];

// O Supabase devolve no máximo 1000 linhas por consulta — busca em páginas.
async function buscarTodas(montarQuery) {
  const tamanho = 1000;
  let todas = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montarQuery().range(de, de + tamanho - 1);
    if (error || !data) break;
    todas = todas.concat(data);
    if (data.length < tamanho) break;
  }
  return todas;
}

function statusDoPedido(o) {
  return o.entregue ? "Produto Entregue" : o.status;
}

function situacaoDaPeca(i) {
  if (i.indisponivel) return "Indisponível Samsung";
  if (i.liberado) return "Liberada";
  return "";
}

export default function RelatorioPecasPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);
  const [pedidos, setPedidos] = useState([]);
  const [itens, setItens] = useState([]);

  const [periodo, setPeriodo] = useState("mes");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [statusSel, setStatusSel] = useState([]); // vazio = todos
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [clienteFiltro, setClienteFiltro] = useState("");
  const [busca, setBusca] = useState("");
  const [agrupar, setAgrupar] = useState("nenhum");

  const intervalo = useMemo(() => calcularIntervalo(periodo, dataDe, dataAte), [periodo, dataDe, dataAte]);
  const veCusto = CARGOS_RELATORIO_PECAS_CUSTO.includes(perfil?.cargo);
  const veVendedor = !["Vendedor"].includes(perfil?.cargo);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!CARGOS_RELATORIO_PECAS.includes(perfil?.cargo)) { setCarregando(false); return; }
    (async () => {
      setCarregando(true);
      const unidadeAtiva = getUnidadeAtiva();
      if (!unidadeAtiva) { setCarregando(false); return; }

      const orcs = await buscarTodas(() => {
        let q = supabase
          .from("orcamentos")
          .select("id, numero_unidade, status, entregue, entregue_em, criado_em, vendedor_id, cliente_id, nota_fiscal_numero, os_interna, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
          .eq("unidade_id", unidadeAtiva.id)
          .order("criado_em", { ascending: false });
        if (intervalo) q = q.gte("criado_em", intervalo.de.toISOString()).lte("criado_em", intervalo.ate.toISOString());
        if (perfil.cargo === "Vendedor") q = q.eq("vendedor_id", perfil.id);
        return q;
      });
      setPedidos(orcs);

      // itens em lotes de 150 pedidos (evita URL grande demais no .in())
      const ids = orcs.map((o) => o.id);
      let todosItens = [];
      for (let k = 0; k < ids.length; k += 150) {
        const lote = ids.slice(k, k + 150);
        const parte = await buscarTodas(() =>
          supabase
            .from("orcamento_itens")
            .select("id, orcamento_id, codigo, descricao_resumida, modelo, categoria, qtd, custo_unitario, custo_real, venda_unitario, venda_total, no_entrega, liberado, indisponivel")
            .in("orcamento_id", lote)
            .order("id")
        );
        todosItens = todosItens.concat(parte);
      }
      setItens(todosItens);
      setCarregando(false);
    })();
  }, [perfil, intervalo]);

  const pedidoPorId = useMemo(() => {
    const m = {};
    pedidos.forEach((o) => { m[o.id] = o; });
    return m;
  }, [pedidos]);

  // listas dos filtros: só quem aparece nos pedidos do período
  const vendedoresLista = useMemo(() => {
    const m = new Map();
    pedidos.forEach((o) => { if (o.vendedor_id && !m.has(o.vendedor_id)) m.set(o.vendedor_id, o.perfis?.nome || "—"); });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pedidos]);
  const clientesLista = useMemo(() => {
    const m = new Map();
    pedidos.forEach((o) => {
      if (o.cliente_id == null) return;
      if (vendedorFiltro && o.vendedor_id !== vendedorFiltro) return;
      const k = String(o.cliente_id);
      if (!m.has(k)) m.set(k, o.clientes?.nome || "—");
    });
    return [...m.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [pedidos, vendedorFiltro]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return itens
      .map((i) => {
        const o = pedidoPorId[i.orcamento_id];
        if (!o) return null;
        const qtd = Number(i.qtd || 0);
        const custoUnit = Number(i.custo_real ?? i.custo_unitario ?? 0);
        const vendaTotal = i.venda_total != null ? Number(i.venda_total) : Number(i.venda_unitario || 0) * qtd;
        return {
          ...i,
          pedido: o,
          status: statusDoPedido(o),
          vendedorNome: o.perfis?.nome || "—",
          clienteNome: o.clientes?.nome || "—",
          qtdNum: qtd,
          custoTotal: custoUnit * qtd,
          vendaUnit: qtd > 0 ? vendaTotal / qtd : Number(i.venda_unitario || 0),
          vendaTotal,
          situacao: situacaoDaPeca(i)
        };
      })
      .filter(Boolean)
      .filter((l) => {
        if (statusSel.length > 0 && !statusSel.includes(l.status)) return false;
        if (vendedorFiltro && l.pedido.vendedor_id !== vendedorFiltro) return false;
        if (clienteFiltro && String(l.pedido.cliente_id) !== clienteFiltro) return false;
        if (termo && !`${l.codigo || ""} ${l.descricao_resumida || ""} ${l.modelo || ""}`.toLowerCase().includes(termo)) return false;
        return true;
      })
      .sort((a, b) => {
        if (agrupar === "vendedor") { const c = a.vendedorNome.localeCompare(b.vendedorNome, "pt-BR"); if (c) return c; }
        if (agrupar === "cliente") { const c = a.clienteNome.localeCompare(b.clienteNome, "pt-BR"); if (c) return c; }
        return new Date(b.pedido.criado_em) - new Date(a.pedido.criado_em) || a.id - b.id;
      });
  }, [itens, pedidoPorId, statusSel, vendedorFiltro, clienteFiltro, busca, agrupar]);

  // grupos com subtotal (ou um grupo só, sem cabeçalho, quando "Sem agrupar")
  const grupos = useMemo(() => {
    if (agrupar === "nenhum") return [{ chave: "", linhas }];
    const lista = [];
    linhas.forEach((l) => {
      const chave = agrupar === "vendedor" ? l.vendedorNome : l.clienteNome;
      const ultimo = lista[lista.length - 1];
      if (ultimo && ultimo.chave === chave) ultimo.linhas.push(l);
      else lista.push({ chave, linhas: [l] });
    });
    return lista;
  }, [linhas, agrupar]);

  const somar = (ls) => ({
    pedidos: new Set(ls.map((l) => l.orcamento_id)).size,
    qtd: ls.reduce((s, l) => s + l.qtdNum, 0),
    custo: ls.reduce((s, l) => s + l.custoTotal, 0),
    venda: ls.reduce((s, l) => s + l.vendaTotal, 0)
  });
  const totais = somar(linhas);

  function alternarStatus(s) {
    setStatusSel((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));
  }

  function exportarExcel() {
    const dados = linhas.map((l) => ({
      Pedido: l.pedido.numero_unidade,
      "Data do pedido": fmtData(l.pedido.criado_em),
      Status: l.status,
      Cliente: l.clienteNome,
      ...(veVendedor ? { Vendedor: l.vendedorNome } : {}),
      "OS Interna": l.pedido.os_interna || "",
      "Nota Fiscal": l.pedido.nota_fiscal_numero || "",
      "Código": l.codigo || "",
      "Descrição": l.descricao_resumida || "",
      Modelo: l.modelo || "",
      Categoria: l.categoria || "",
      Qtd: l.qtdNum,
      ...(veCusto ? { "Custo total (R$)": Number(l.custoTotal.toFixed(2)) } : {}),
      "Venda unitária (R$)": Number(l.vendaUnit.toFixed(2)),
      "Venda total (R$)": Number(l.vendaTotal.toFixed(2)),
      Delivery: l.no_entrega || "",
      "Situação da peça": l.situacao
    }));
    const ws = XLSX.utils.json_to_sheet(dados);
    ws["!cols"] = Object.keys(dados[0] || { a: 1 }).map((k) => ({ wch: ["Cliente", "Descrição"].includes(k) ? 34 : k === "Status" ? 30 : 15 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Peças");
    XLSX.writeFile(wb, `relatorio-pecas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Relatório de Peças"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }
  if (perfil && !CARGOS_RELATORIO_PECAS.includes(perfil.cargo)) {
    return (
      <AppShell titulo="Relatório de Peças">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Você não tem permissão para ver este relatório.</p>
        </div>
      </AppShell>
    );
  }

  const colunas = 10 + (veVendedor ? 1 : 0) + (veCusto ? 1 : 0);

  return (
    <AppShell titulo="Relatório de Peças">
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {PERIODOS.map((p) => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} className={`chip ${periodo === p.id ? "chip-active" : ""}`}>
              {p.label}
            </button>
          ))}
          {periodo === "personalizado" && (
            <div className="flex items-center gap-1.5">
              <input type="date" className="field-input py-1.5 text-xs w-[8.5rem]" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
              <span className="text-xs text-muted">até</span>
              <input type="date" className="field-input py-1.5 text-xs w-[8.5rem]" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
          )}
          <button className="btn-primary text-xs py-2 ml-auto" onClick={exportarExcel} disabled={linhas.length === 0}>
            <Download size={14} />
            Exportar Excel
          </button>
        </div>
        <p className="text-[11px] text-muted mb-3">O período considera a data de criação do pedido.</p>

        <div className="mb-3">
          <div className="flex items-center gap-2 mb-1.5">
            <label className="field-label mb-0">Status</label>
            <span className="text-[11px] text-muted">{statusSel.length === 0 ? "(todos)" : `${statusSel.length} selecionado(s)`}</span>
            {statusSel.length > 0 && (
              <button type="button" className="text-[11px] text-muted hover:text-ink inline-flex items-center gap-0.5" onClick={() => setStatusSel([])}>
                <X size={11} /> limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPCOES.map((s) => {
              const ativo = statusSel.includes(s);
              const cor = CORES_STATUS[s] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
              const Icone = ICONES_STATUS[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => alternarStatus(s)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border inline-flex items-center gap-1.5 transition"
                  style={ativo ? { background: cor.bg, color: cor.fg, borderColor: cor.fg } : { borderColor: "var(--line)", color: "var(--muted, #5D6572)" }}
                >
                  {Icone && <Icone size={12} />}
                  {s}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {veVendedor && (
            <div>
              <label className="field-label">Vendedor</label>
              <select className="field-input" value={vendedorFiltro} onChange={(e) => { setVendedorFiltro(e.target.value); setClienteFiltro(""); }}>
                <option value="">Todos os vendedores</option>
                {vendedoresLista.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="field-label">Cliente</label>
            <select className="field-input" value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)}>
              <option value="">Todos os clientes</option>
              {clientesLista.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Código / descrição</label>
            <input className="field-input" placeholder="Buscar peça..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Organizar</label>
            <select className="field-input" value={agrupar} onChange={(e) => setAgrupar(e.target.value)}>
              {AGRUPAMENTOS.filter((a) => veVendedor || a.id !== "vendedor").map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-2 ${veCusto ? "sm:grid-cols-4" : "sm:grid-cols-3"} gap-3 mb-4`}>
        <CardStat icone={ClipboardList} cor="#7A4FB0" label="Pedidos" valor={String(totais.pedidos)} />
        <CardStat icone={Boxes} cor="#2E7F97" label="Peças (qtd)" valor={String(totais.qtd)} />
        {veCusto && <CardStat icone={Package} cor="#9C5A34" label="Custo total" valor={fmtBRL(totais.custo)} />}
        <CardStat icone={Wallet} cor="#2C7C6E" corValor="#2C7C6E" label="Venda total" valor={fmtBRL(totais.venda)} />
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhuma peça encontrada com esses filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Pedido</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Data</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Cliente</th>
                  {veVendedor && <th className="text-left px-3 py-2.5 whitespace-nowrap">Vendedor</th>}
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Status</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Código</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Descrição</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Modelo</th>
                  <th className="text-center px-3 py-2.5 whitespace-nowrap">Qtd</th>
                  {veCusto && <th className="text-right px-3 py-2.5 whitespace-nowrap">Custo</th>}
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Venda</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Delivery / Situação</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => {
                  const sub = somar(g.linhas);
                  return [
                    g.chave ? (
                      <tr key={`h-${g.chave}`} className="bg-canvas border-b border-line">
                        <td colSpan={colunas} className="px-3 py-2 text-xs font-semibold">
                          {g.chave}
                          <span className="ml-2 font-normal text-muted">
                            {sub.pedidos} pedido(s) · {sub.qtd} peça(s){veCusto ? ` · custo ${fmtBRL(sub.custo)}` : ""} · venda {fmtBRL(sub.venda)}
                          </span>
                        </td>
                      </tr>
                    ) : null,
                    ...g.linhas.map((l) => {
                      const cor = CORES_STATUS[l.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
                      return (
                        <tr
                          key={l.id}
                          className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                          onClick={() => router.push(`/orcamentos/${l.orcamento_id}`)}
                          title="Abrir o pedido"
                        >
                          <td className="px-3 py-2 font-mono text-muted whitespace-nowrap">#{l.pedido.numero_unidade}</td>
                          <td className="px-3 py-2 text-muted whitespace-nowrap">{fmtData(l.pedido.criado_em)}</td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate">{l.clienteNome}</td>
                          {veVendedor && <td className="px-3 py-2 text-muted whitespace-nowrap">{l.vendedorNome}</td>}
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: cor.bg, color: cor.fg }}>{l.status}</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs whitespace-nowrap" style={{ color: "var(--accent)" }}>{l.codigo || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap max-w-[260px] truncate" title={l.descricao_resumida || ""}>{l.descricao_resumida || "—"}</td>
                          <td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">{l.modelo || "—"}</td>
                          <td className="px-3 py-2 text-center font-mono">{l.qtdNum}</td>
                          {veCusto && <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtBRL(l.custoTotal)}</td>}
                          <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtBRL(l.vendaTotal)}</td>
                          <td className="px-3 py-2 text-xs whitespace-nowrap">
                            {l.no_entrega && <span className="font-mono text-muted">{l.no_entrega}</span>}
                            {l.situacao && (
                              <span
                                className="ml-1.5 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded"
                                style={l.indisponivel ? { background: "rgba(214,51,108,0.14)", color: "#D6336C" } : { background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}
                              >
                                {l.situacao}
                              </span>
                            )}
                            {!l.no_entrega && !l.situacao && <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      );
                    })
                  ];
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-canvas font-semibold">
                  <td className="px-3 py-2.5" colSpan={colunas - (veCusto ? 4 : 3)}>Total</td>
                  <td className="px-3 py-2.5 text-center font-mono">{totais.qtd}</td>
                  {veCusto && <td className="px-3 py-2.5 text-right font-mono">{fmtBRL(totais.custo)}</td>}
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: "#2C7C6E" }}>{fmtBRL(totais.venda)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
