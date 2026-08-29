"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Download, ChevronLeft, ChevronRight, ShieldAlert, Calendar, Wallet, Receipt,
  Percent, TrendingUp, Trophy, Award, Medal, Users
} from "lucide-react";
import * as XLSX from "xlsx";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from "recharts";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import CardStat from "../../../components/CardStat";
import { getUnidadeAtiva } from "../../../lib/unidade";
import {
  CARGOS_COMISSOES,
  CARGOS_COMISSOES_TODOS,
  inicioSemana,
  fimSemana,
  rotuloSemana,
  calcularLinhaResumo
} from "../../../lib/relatorios";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBRLCompacto(v) {
  if (!v) return "R$ 0";
  if (Math.abs(v) >= 1000) return "R$ " + (v / 1000).toFixed(1).replace(".", ",") + "k";
  return fmtBRL(v);
}
function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}
function fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}
function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const CORES_POSICAO = ["#E8A33D", "#8B93A1", "#B0703A"]; // ouro, prata, bronze
const ICONES_POSICAO = [Trophy, Award, Medal];

function TooltipRanking({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="card p-2.5 text-xs shadow-lg">
      <p className="font-semibold mb-1">{p.nome}</p>
      <p style={{ color: "#C2801F" }}>Comissão: <b>{fmtBRL(p.comissaoTotal)}</b></p>
      <p className="text-muted">{p.qtdPedidos} pedido(s) · {fmtBRL(p.valorVendido)} vendido</p>
    </div>
  );
}

export default function RelatorioComissoesPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);
  const [tipoPeriodo, setTipoPeriodo] = useState("mensal"); // "mensal" | "semanal"
  const [mesSelecionado, setMesSelecionado] = useState(mesAtualStr());
  const [semanaRef, setSemanaRef] = useState(() => new Date());
  const [vendedores, setVendedores] = useState([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [pedidos, setPedidos] = useState([]);

  const ehVendedor = perfil?.cargo === "Vendedor";
  const podeVerTodos = CARGOS_COMISSOES_TODOS.includes(perfil?.cargo);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  useEffect(() => {
    if (!podeVerTodos) return;
    (async () => {
      const unidadeAtiva = getUnidadeAtiva();
      if (!unidadeAtiva) return;
      const { data: vinculos } = await supabase.from("perfis_unidades").select("perfil_id").eq("unidade_id", unidadeAtiva.id);
      const ids = (vinculos || []).map((v) => v.perfil_id);
      if (ids.length === 0) { setVendedores([]); return; }
      const { data: vends } = await supabase.from("perfis").select("id, nome").eq("cargo", "Vendedor").in("id", ids).order("nome");
      setVendedores(vends || []);
    })();
  }, [podeVerTodos]);

  const periodo = useMemo(() => {
    if (tipoPeriodo === "semanal") {
      return { de: inicioSemana(semanaRef), ate: fimSemana(semanaRef) };
    }
    const [ano, mes] = mesSelecionado.split("-").map(Number);
    if (!ano || !mes) return null;
    const de = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const ate = new Date(ano, mes, 0, 23, 59, 59, 999);
    return { de, ate };
  }, [tipoPeriodo, mesSelecionado, semanaRef]);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!CARGOS_COMISSOES.includes(perfil?.cargo) || !periodo) { setCarregando(false); return; }
    (async () => {
      setCarregando(true);
      const unidadeAtiva = getUnidadeAtiva();
      if (!unidadeAtiva) { setCarregando(false); return; }

      let query = supabase
        .from("orcamentos")
        .select("id, numero_unidade, valor_total, vendedor_id, entregue_em, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome, comissao_percentual)")
        .eq("unidade_id", unidadeAtiva.id)
        .eq("entregue", true)
        .gte("entregue_em", periodo.de.toISOString())
        .lte("entregue_em", periodo.ate.toISOString())
        .order("entregue_em", { ascending: false });

      if (ehVendedor) {
        query = query.eq("vendedor_id", perfil.id);
      } else if (vendedorFiltro) {
        query = query.eq("vendedor_id", vendedorFiltro);
      }

      const { data } = await query;
      setPedidos(data || []);
      setCarregando(false);
    })();
  }, [perfil, periodo, vendedorFiltro, ehVendedor]);

  const linhas = useMemo(() => {
    return pedidos.map((o) => {
      const comissaoCadastrada = o.perfis?.comissao_percentual !== null && o.perfis?.comissao_percentual !== undefined;
      const calc = calcularLinhaResumo({
        valorPago: o.valor_total,
        custoPecas: 0,
        impostoPct: 0,
        comissaoPct: o.perfis?.comissao_percentual
      });
      return { ...o, valorPedido: Number(o.valor_total || 0), comissaoCadastrada, comissaoVendedor: calc.comissaoVendedor };
    });
  }, [pedidos]);

  const totais = linhas.reduce(
    (acc, l) => ({ valorVendido: acc.valorVendido + l.valorPedido, comissaoTotal: acc.comissaoTotal + l.comissaoVendedor }),
    { valorVendido: 0, comissaoTotal: 0 }
  );
  const qtdPedidos = linhas.length;
  const ticketMedioComissao = qtdPedidos > 0 ? totais.comissaoTotal / qtdPedidos : 0;
  const taxaEfetiva = totais.valorVendido > 0 ? (totais.comissaoTotal / totais.valorVendido) * 100 : 0;

  // ranking por vendedor (só faz sentido quando dá pra ver todos e nenhum vendedor específico foi filtrado)
  const rankingVendedores = useMemo(() => {
    const mapa = {};
    linhas.forEach((l) => {
      const chave = l.vendedor_id || "sem-vendedor";
      if (!mapa[chave]) mapa[chave] = { vendedorId: l.vendedor_id, nome: l.perfis?.nome || "Sem vendedor", qtdPedidos: 0, valorVendido: 0, comissaoTotal: 0 };
      mapa[chave].qtdPedidos += 1;
      mapa[chave].valorVendido += l.valorPedido;
      mapa[chave].comissaoTotal += l.comissaoVendedor;
    });
    return Object.values(mapa).sort((a, b) => b.comissaoTotal - a.comissaoTotal);
  }, [linhas]);

  const visaoUnica = ehVendedor || (podeVerTodos && !!vendedorFiltro);

  // dados do gráfico: ranking por vendedor (visão gerencial) ou top pedidos do próprio vendedor (visão única)
  const dadosGrafico = useMemo(() => {
    if (!visaoUnica) {
      return rankingVendedores.slice(0, 10).map((v) => ({ nome: v.nome, comissaoTotal: v.comissaoTotal, qtdPedidos: v.qtdPedidos, valorVendido: v.valorVendido }));
    }
    return [...linhas]
      .sort((a, b) => b.comissaoVendedor - a.comissaoVendedor)
      .slice(0, 10)
      .map((l) => ({ nome: `#${l.numero_unidade}`, comissaoTotal: l.comissaoVendedor, qtdPedidos: 1, valorVendido: l.valorPedido }));
  }, [visaoUnica, rankingVendedores, linhas]);

  const rotuloPeriodo = tipoPeriodo === "semanal"
    ? `${rotuloSemana(semanaRef)} (${periodo.de.toLocaleDateString("pt-BR")} – ${periodo.ate.toLocaleDateString("pt-BR")})`
    : (() => {
        const [ano, mes] = mesSelecionado.split("-").map(Number);
        return `${NOMES_MES[(mes || 1) - 1]}/${ano}`;
      })();

  function exportarExcel() {
    const wb = XLSX.utils.book_new();

    const ranking = rankingVendedores.map((v, i) => ({
      "Posição": i + 1,
      Vendedor: v.nome,
      Pedidos: v.qtdPedidos,
      "Valor Vendido (R$)": Number(v.valorVendido.toFixed(2)),
      "Comissão (R$)": Number(v.comissaoTotal.toFixed(2)),
      "Taxa Efetiva (%)": Number((v.valorVendido > 0 ? (v.comissaoTotal / v.valorVendido) * 100 : 0).toFixed(1))
    }));
    const wsRanking = XLSX.utils.json_to_sheet(ranking);
    wsRanking["!cols"] = [{ wch: 9 }, { wch: 22 }, { wch: 9 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsRanking, "Ranking por Vendedor");

    const detalhado = linhas.map((l) => ({
      Pedido: l.numero_unidade,
      Cliente: l.clientes?.nome || "",
      Vendedor: l.perfis?.nome || "",
      "% Comissão": l.perfis?.comissao_percentual ?? 0,
      "Data de entrega": fmtData(l.entregue_em),
      "Valor do Pedido (R$)": Number(l.valorPedido.toFixed(2)),
      "Comissão (R$)": Number(l.comissaoVendedor.toFixed(2))
    }));
    const wsDetalhe = XLSX.utils.json_to_sheet(detalhado);
    wsDetalhe["!cols"] = [{ wch: 9 }, { wch: 22 }, { wch: 18 }, { wch: 11 }, { wch: 13 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsDetalhe, "Detalhado");

    const sufixo = tipoPeriodo === "semanal" ? rotuloSemana(semanaRef) : mesSelecionado;
    XLSX.writeFile(wb, `relatorio-comissoes-${sufixo}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Comissões"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !CARGOS_COMISSOES.includes(perfil.cargo)) {
    return (
      <AppShell titulo="Comissões">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente, Supervisor, Financeiro e Vendedor veem este relatório.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Relatórios — Comissões">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-sm text-muted">
          {ehVendedor ? "Suas comissões, calculadas sobre os pedidos já entregues." : "Comissão de cada vendedor da unidade, sobre os pedidos já entregues."}
        </p>
        <button className="btn-secondary text-xs py-2" onClick={exportarExcel} disabled={linhas.length === 0}>
          <Download size={14} />
          Exportar Excel
        </button>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button className={`chip ${tipoPeriodo === "mensal" ? "chip-active" : ""}`} onClick={() => setTipoPeriodo("mensal")}>Mensal</button>
          <button className={`chip ${tipoPeriodo === "semanal" ? "chip-active" : ""}`} onClick={() => setTipoPeriodo("semanal")}>Semanal</button>

          {tipoPeriodo === "mensal" ? (
            <input
              type="month"
              className="field-input py-1.5 text-xs w-auto"
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(e.target.value)}
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSemanaRef((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-line text-muted hover:text-ink"
                aria-label="Semana anterior"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Calendar size={11} className="inline mr-1 -mt-0.5" />
                {rotuloPeriodo}
              </span>
              <button
                type="button"
                onClick={() => setSemanaRef((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-line text-muted hover:text-ink"
                aria-label="Próxima semana"
              >
                <ChevronRight size={14} />
              </button>
              <button type="button" onClick={() => setSemanaRef(new Date())} className="btn-secondary text-xs py-1.5 ml-1">
                Semana atual
              </button>
            </div>
          )}
        </div>

        {podeVerTodos && (
          <div className="max-w-xs">
            <label className="field-label">Vendedor</label>
            <select className="field-input" value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
              <option value="">Todos os vendedores</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {tipoPeriodo === "mensal" && (
        <p className="text-sm text-muted mb-3">Período: <b>{rotuloPeriodo}</b></p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <CardStat icone={Percent} cor="#C2801F" corValor="#C2801F" label="Comissão Total" valor={fmtBRL(totais.comissaoTotal)} destaque />
        <CardStat icone={Wallet} cor="#2E6DA8" label="Valor Vendido" valor={fmtBRL(totais.valorVendido)} />
        <CardStat icone={Receipt} cor="#7A4FB0" label="Pedidos Entregues" valor={String(qtdPedidos)} />
        <CardStat icone={TrendingUp} cor="#2C7C6E" label="Taxa Efetiva" valor={fmtPct(taxaEfetiva)} tooltip="Comissão Total ÷ Valor Vendido no período." />
      </div>

      {dadosGrafico.length > 0 && (
        <div className="card p-5 mb-5">
          <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
            {visaoUnica ? <Receipt size={15} style={{ color: "var(--accent)" }} /> : <Users size={15} style={{ color: "var(--accent)" }} />}
            {visaoUnica ? "Comissão por pedido (top 10)" : "Ranking de comissão por vendedor"}
          </p>
          <div style={{ filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.14))" }}>
            <ResponsiveContainer width="100%" height={Math.max(220, dadosGrafico.length * 34)}>
              <BarChart data={dadosGrafico} layout="vertical" margin={{ left: 8, right: 32, top: 8, bottom: 8 }}>
                <defs>
                  <linearGradient id="gradComissao" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#F3C877" />
                    <stop offset="100%" stopColor="#C2801F" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={fmtBRLCompacto} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 12, fontWeight: 600 }} width={110} />
                <Tooltip content={<TooltipRanking />} cursor={{ fill: "rgba(127,127,127,0.08)" }} />
                <Bar dataKey="comissaoTotal" fill="url(#gradComissao)" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  <LabelList dataKey="comissaoTotal" position="right" formatter={(v) => fmtBRLCompacto(v)} style={{ fontSize: 11, fontWeight: 700, fill: "#9C6A1F" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {!visaoUnica && rankingVendedores.length > 0 && (
        <div className="card overflow-hidden mb-5">
          <p className="font-display font-semibold text-sm p-4 pb-2">Ranking por vendedor</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5 w-14">#</th>
                <th className="text-left px-4 py-2.5">Vendedor</th>
                <th className="text-right px-4 py-2.5">Pedidos</th>
                <th className="text-right px-4 py-2.5">Valor Vendido</th>
                <th className="text-right px-4 py-2.5">Comissão</th>
              </tr>
            </thead>
            <tbody>
              {rankingVendedores.map((v, i) => {
                const IconePosicao = ICONES_POSICAO[i];
                return (
                  <tr key={v.vendedorId || v.nome} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => v.vendedorId && setVendedorFiltro(String(v.vendedorId))}>
                    <td className="px-4 py-2.5">
                      {IconePosicao ? <IconePosicao size={16} style={{ color: CORES_POSICAO[i] }} /> : <span className="text-muted font-mono text-xs">{i + 1}</span>}
                    </td>
                    <td className="px-4 py-2.5 font-medium">{v.nome}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-muted">{v.qtdPedidos}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(v.valorVendido)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#C2801F" }}>{fmtBRL(v.comissaoTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {visaoUnica && vendedorFiltro && podeVerTodos && (
        <button className="text-xs text-muted hover:text-ink mb-3 flex items-center gap-1.5" onClick={() => setVendedorFiltro("")}>
          <ChevronLeft size={13} />
          Voltar pro ranking de todos os vendedores
        </button>
      )}

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum pedido entregue nesse período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Pedido</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Cliente</th>
                  {podeVerTodos && <th className="text-left px-3 py-2.5 whitespace-nowrap">Vendedor</th>}
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Entrega</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Valor do Pedido</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">% Comissão</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0">
                    <td className="px-3 py-2.5 font-mono text-muted whitespace-nowrap">#{l.numero_unidade}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{l.clientes?.nome || "—"}</td>
                    {podeVerTodos && (
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                        {l.perfis?.nome || "—"}
                        {!l.comissaoCadastrada && (
                          <span className="ml-1.5 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--danger-soft)", color: "var(--danger)" }} title="Comissão não cadastrada pra esse vendedor — sendo tratada como 0%.">
                            sem comissão
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-muted whitespace-nowrap">{fmtData(l.entregue_em)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtBRL(l.valorPedido)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted whitespace-nowrap">{fmtPct(l.perfis?.comissao_percentual)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: "#C2801F" }}>{fmtBRL(l.comissaoVendedor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-canvas font-semibold">
                  <td className="px-3 py-2.5" colSpan={podeVerTodos ? 4 : 3}>Total</td>
                  <td className="px-3 py-2.5 text-right font-mono">{fmtBRL(totais.valorVendido)}</td>
                  <td></td>
                  <td className="px-3 py-2.5 text-right font-mono" style={{ color: "#C2801F" }}>{fmtBRL(totais.comissaoTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
