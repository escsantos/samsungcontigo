"use client";
import { useEffect, useMemo, useState } from "react";
import { Download, ChevronLeft, ChevronRight, ShieldAlert, Calendar, Wallet, Package, TrendingUp, Percent, PiggyBank, Info } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { getUnidadeAtiva } from "../../../lib/unidade";
import {
  CARGOS_RELATORIOS,
  CARGOS_TODOS_VENDEDORES,
  inicioSemana,
  fimSemana,
  rotuloSemana,
  calcularLinhaResumo
} from "../../../lib/relatorios";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function CardStat({ icone: Icone, cor, label, valor, corValor, tooltip, destaque }) {
  return (
    <div
      className="card p-4 relative"
      style={destaque ? { borderColor: cor, boxShadow: `0 0 0 1.5px ${cor}` } : undefined}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cor}1F`, color: cor }}>
          <Icone size={15} />
        </div>
        <p className="text-xs text-muted flex items-center gap-1 leading-tight">
          {label}
          {tooltip && (
            <span className="group relative inline-flex items-center">
              <Info size={12} className="cursor-help" />
              <span className="pointer-events-none absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-56 rounded-lg text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg" style={{ background: "#1F2430" }}>
                {tooltip}
              </span>
            </span>
          )}
        </p>
      </div>
      <p className="font-mono font-bold text-lg" style={corValor ? { color: corValor } : undefined}>{valor}</p>
    </div>
  );
}

export default function RelatorioResumoPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);
  const [tipoPeriodo, setTipoPeriodo] = useState("mensal"); // "mensal" | "semanal"
  const [mesSelecionado, setMesSelecionado] = useState(mesAtualStr());
  const [semanaRef, setSemanaRef] = useState(() => new Date());
  const [vendedores, setVendedores] = useState([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [pedidos, setPedidos] = useState([]);
  const [itensPorPedido, setItensPorPedido] = useState({});
  const [pedidoAberto, setPedidoAberto] = useState(null);

  const ehVendedor = perfil?.cargo === "Vendedor";
  const podeEscolherVendedor = CARGOS_TODOS_VENDEDORES.includes(perfil?.cargo);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  useEffect(() => {
    if (!podeEscolherVendedor) return;
    (async () => {
      const unidadeAtiva = getUnidadeAtiva();
      if (!unidadeAtiva) return;
      const { data: vinculos } = await supabase.from("perfis_unidades").select("perfil_id").eq("unidade_id", unidadeAtiva.id);
      const ids = (vinculos || []).map((v) => v.perfil_id);
      if (ids.length === 0) { setVendedores([]); return; }
      const { data: vends } = await supabase.from("perfis").select("id, nome").eq("cargo", "Vendedor").in("id", ids).order("nome");
      setVendedores(vends || []);
    })();
  }, [podeEscolherVendedor]);

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
    if (!CARGOS_RELATORIOS.includes(perfil?.cargo) || !periodo) { setCarregando(false); return; }
    (async () => {
      setCarregando(true);
      const unidadeAtiva = getUnidadeAtiva();
      if (!unidadeAtiva) { setCarregando(false); return; }

      let query = supabase
        .from("orcamentos")
        .select("id, numero_unidade, valor_total, imposto_total, vendedor_id, entregue_em, nota_fiscal_numero, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome, comissao_percentual)")
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
      const lista = data || [];
      setPedidos(lista);

      const ids = lista.map((o) => o.id);
      if (ids.length > 0) {
        const { data: itens } = await supabase
          .from("orcamento_itens")
          .select("orcamento_id, codigo, descricao_resumida, categoria, qtd, custo_real, venda_total")
          .in("orcamento_id", ids);
        const mapa = {};
        (itens || []).forEach((i) => {
          mapa[i.orcamento_id] = [...(mapa[i.orcamento_id] || []), i];
        });
        setItensPorPedido(mapa);
      } else {
        setItensPorPedido({});
      }
      setCarregando(false);
    })();
  }, [perfil, periodo, vendedorFiltro, ehVendedor]);

  const linhas = useMemo(() => {
    return pedidos.map((o) => {
      const itens = itensPorPedido[o.id] || [];
      const custoPecas = itens.reduce((s, i) => s + Number(i.custo_real || 0) * Number(i.qtd || 0), 0);
      const comissaoCadastrada = o.perfis?.comissao_percentual !== null && o.perfis?.comissao_percentual !== undefined;
      const calc = calcularLinhaResumo({
        valorPago: o.valor_total,
        custoPecas,
        impostoPct: o.imposto_total,
        comissaoPct: o.perfis?.comissao_percentual
      });
      return {
        ...o,
        valorPago: Number(o.valor_total || 0),
        custoPecas,
        comissaoCadastrada,
        itens,
        ...calc
      };
    });
  }, [pedidos, itensPorPedido]);

  const totais = linhas.reduce(
    (acc, l) => ({
      valorPago: acc.valorPago + l.valorPago,
      custoPecas: acc.custoPecas + l.custoPecas,
      valorImposto: acc.valorImposto + l.valorImposto,
      margemBruta: acc.margemBruta + l.margemBruta,
      comissaoVendedor: acc.comissaoVendedor + l.comissaoVendedor,
      margemLiquida: acc.margemLiquida + l.margemLiquida
    }),
    { valorPago: 0, custoPecas: 0, valorImposto: 0, margemBruta: 0, comissaoVendedor: 0, margemLiquida: 0 }
  );
  const totalLucroLiquidoPct = totais.valorPago > 0 ? (totais.margemLiquida / totais.valorPago) * 100 : 0;

  const rotuloPeriodo = tipoPeriodo === "semanal"
    ? `${rotuloSemana(semanaRef)} (${periodo.de.toLocaleDateString("pt-BR")} – ${periodo.ate.toLocaleDateString("pt-BR")})`
    : (() => {
        const [ano, mes] = mesSelecionado.split("-").map(Number);
        return `${NOMES_MES[(mes || 1) - 1]}/${ano}`;
      })();

  function exportarExcel() {
    const linhasExport = linhas.map((l) => ({
      "Número do Pedido": l.numero_unidade,
      "Nota Fiscal": l.nota_fiscal_numero || "",
      Cliente: l.clientes?.nome || "",
      Vendedor: l.perfis?.nome || "",
      "Data de entrega": fmtData(l.entregue_em),
      "Custo das Peças (R$)": Number(l.custoPecas.toFixed(2)),
      "Valor do Imposto (R$)": Number(l.valorImposto.toFixed(2)),
      "Valor Recebido (R$)": Number(l.valorPago.toFixed(2)),
      "Margem Bruta (R$)": Number(l.margemBruta.toFixed(2)),
      "Comissão Vendedor (R$)": Number(l.comissaoVendedor.toFixed(2)),
      "Margem Líquida (R$)": Number(l.margemLiquida.toFixed(2)),
      "Lucro Líquido (%)": Number(l.lucroLiquidoPct.toFixed(1))
    }));
    const ws = XLSX.utils.json_to_sheet(linhasExport);
    ws["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 22 }, { wch: 18 }, { wch: 13 }, { wch: 15 }, { wch: 15 }, { wch: 13 }, { wch: 15 }, { wch: 17 }, { wch: 15 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumo");
    const sufixo = tipoPeriodo === "semanal" ? rotuloSemana(semanaRef) : mesSelecionado;
    XLSX.writeFile(wb, `relatorio-resumo-${sufixo}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Resumo"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !CARGOS_RELATORIOS.includes(perfil.cargo)) {
    return (
      <AppShell titulo="Resumo">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente, Supervisor e Vendedor veem este relatório.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Relatórios — Resumo">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-sm text-muted">
          Pedidos já entregues, com margem e comissão calculadas a partir da data de entrega.
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

        {podeEscolherVendedor && (
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

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <CardStat
          icone={Wallet}
          cor="#2E6DA8"
          label="Valor Recebido"
          valor={fmtBRL(totais.valorPago)}
        />
        <CardStat
          icone={Package}
          cor="#9C5A34"
          label="Custo Total de Peças"
          valor={fmtBRL(totais.custoPecas)}
          destaque
        />
        <CardStat
          icone={TrendingUp}
          cor="#7A4FB0"
          label="Margem Bruta"
          valor={fmtBRL(totais.margemBruta)}
          tooltip="Valor Recebido − (Custo Total de Peças + Valor do Imposto)."
        />
        <CardStat
          icone={Percent}
          cor="#C2801F"
          label="Comissão Vendedor"
          valor={fmtBRL(totais.comissaoVendedor)}
          tooltip="Valor Recebido × % de comissão cadastrado no perfil do vendedor."
        />
        <CardStat
          icone={PiggyBank}
          cor="#2C7C6E"
          corValor="#2C7C6E"
          label={`Margem Líquida (${fmtPct(totalLucroLiquidoPct)})`}
          valor={fmtBRL(totais.margemLiquida)}
          tooltip="Margem Bruta − Comissão do Vendedor. O percentual é a margem líquida sobre o Valor Recebido."
        />
      </div>

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
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Nota Fiscal</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">Cliente</th>
                  {podeEscolherVendedor && <th className="text-left px-3 py-2.5 whitespace-nowrap">Vendedor</th>}
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Custo das Peças</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Valor do Imposto</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Valor Recebido</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Margem Bruta</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Comissão Vendedor</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Margem Líquida</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap">Lucro Líquido</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr
                    key={l.id}
                    className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                    onClick={() => setPedidoAberto(l)}
                  >
                    <td className="px-3 py-2.5 font-mono text-muted whitespace-nowrap">#{l.numero_unidade}</td>
                    <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                      {l.nota_fiscal_numero || <span className="text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{l.clientes?.nome || "—"}</td>
                    {podeEscolherVendedor && (
                      <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                        {l.perfis?.nome || "—"}
                        {!l.comissaoCadastrada && (
                          <span className="ml-1.5 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--danger-soft)", color: "var(--danger)" }} title="Comissão não cadastrada pra esse vendedor — sendo tratada como 0%.">
                            sem comissão
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtBRL(l.custoPecas)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtBRL(l.valorImposto)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap">{fmtBRL(l.valorPago)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtBRL(l.margemBruta)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtBRL(l.comissaoVendedor)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap" style={{ color: "#2C7C6E" }}>{fmtBRL(l.margemLiquida)}</td>
                    <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap">{fmtPct(l.lucroLiquidoPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!pedidoAberto}
        onClose={() => setPedidoAberto(null)}
        title={pedidoAberto ? `Itens do Pedido #${pedidoAberto.numero_unidade}` : ""}
      >
        {pedidoAberto && (
          <div>
            <div className="flex items-center justify-between text-xs text-muted mb-3">
              <span>
                {pedidoAberto.clientes?.nome || "—"}
                {pedidoAberto.nota_fiscal_numero && (
                  <span className="ml-2 font-mono" style={{ color: "var(--accent)" }}>NF {pedidoAberto.nota_fiscal_numero}</span>
                )}
              </span>
              <span>Entregue em {fmtData(pedidoAberto.entregue_em)}</span>
            </div>
            {pedidoAberto.itens.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">Nenhum item encontrado nesse pedido.</p>
            ) : (
              <div className="max-h-80 overflow-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wide text-muted font-mono">
                      <th className="text-left px-1.5 py-1.5">Código</th>
                      <th className="text-left px-1.5 py-1.5">Descrição</th>
                      <th className="text-center px-1.5 py-1.5">Qtd</th>
                      <th className="text-right px-1.5 py-1.5">Custo</th>
                      <th className="text-right px-1.5 py-1.5">Venda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidoAberto.itens.map((i, idx) => (
                      <tr key={idx} className="border-t border-line">
                        <td className="px-1.5 py-1.5 font-mono" style={{ color: "var(--accent)" }}>{i.codigo}</td>
                        <td className="px-1.5 py-1.5">{i.descricao_resumida || "—"}</td>
                        <td className="px-1.5 py-1.5 text-center">{i.qtd}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtBRL(Number(i.custo_real || 0) * Number(i.qtd || 0))}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtBRL(i.venda_total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
