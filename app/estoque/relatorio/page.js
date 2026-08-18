"use client";
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { getUnidadeAtiva } from "../../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function inicioSemana() {
  const d = new Date();
  const dia = d.getDay();
  const diff = d.getDate() - dia + (dia === 0 ? -6 : 1);
  const s = new Date(d);
  s.setDate(diff);
  s.setHours(0, 0, 0, 0);
  return s;
}
function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function fimHoje() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

const PERIODOS = [
  { id: "tudo", label: "Tudo" },
  { id: "semana", label: "Esta semana" },
  { id: "mes", label: "Este mês" },
  { id: "personalizado", label: "Personalizado" }
];

export default function RelatorioCustoPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [linhas, setLinhas] = useState([]);
  const [fatoresPedido, setFatoresPedido] = useState({}); // orcamentoId -> { fator, totalPago }
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const unidadeAtiva = getUnidadeAtiva();
      if (!unidadeAtiva) { setCarregando(false); return; }

      const { data: liberados } = await supabase
        .from("orcamento_itens")
        .select("*, orcamentos!inner(id, margem, imposto_total, criado_em, valor_total, desconto, valor_herdado_pai, clientes(nome))")
        .eq("liberado", true)
        .eq("orcamentos.unidade_id", unidadeAtiva.id)
        .order("liberado_em", { ascending: false });
      setLinhas(liberados || []);

      const idsPedidos = [...new Set((liberados || []).map((l) => l.orcamentos?.id).filter(Boolean))];
      const fatores = {};
      if (idsPedidos.length > 0) {
        // subtotal real de cada pedido (soma de TODOS os itens, não só os liberados) — pra achar a proporção do desconto
        const { data: todosItens } = await supabase.from("orcamento_itens").select("orcamento_id, venda_total").in("orcamento_id", idsPedidos);
        const subtotalPorPedido = {};
        (todosItens || []).forEach((i) => {
          subtotalPorPedido[i.orcamento_id] = (subtotalPorPedido[i.orcamento_id] || 0) + Number(i.venda_total || 0);
        });

        // total pago de cada pedido
        const { data: pagamentos } = await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsPedidos);
        const pagoPorPedido = {};
        (pagamentos || []).forEach((p) => {
          pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
        });

        for (const l of liberados || []) {
          const orc = l.orcamentos;
          if (!orc || fatores[orc.id]) continue;
          const subtotal = subtotalPorPedido[orc.id] || 0;
          const fator = subtotal > 0 ? Number(orc.valor_total || 0) / subtotal : 1;
          const totalPago = (pagoPorPedido[orc.id] || 0) + Number(orc.valor_herdado_pai || 0);
          fatores[orc.id] = { fator, totalPago };
        }
      }
      setFatoresPedido(fatores);
      setCarregando(false);
    })();
  }, []);

  const intervalo = useMemo(() => {
    if (periodo === "semana") return { de: inicioSemana(), ate: fimHoje() };
    if (periodo === "mes") return { de: inicioMes(), ate: fimHoje() };
    if (periodo === "personalizado" && dataDe && dataAte) {
      const de = new Date(dataDe + "T00:00:00");
      const ate = new Date(dataAte + "T23:59:59");
      return { de, ate };
    }
    return null;
  }, [periodo, dataDe, dataAte]);

  const linhasNoPeriodo = useMemo(() => {
    if (!intervalo) return linhas;
    return linhas.filter((l) => {
      if (!l.liberado_em) return false;
      const t = new Date(l.liberado_em).getTime();
      return t >= intervalo.de.getTime() && t <= intervalo.ate.getTime();
    });
  }, [linhas, intervalo]);

  const calculadas = useMemo(() => {
    return linhasNoPeriodo.map((l) => {
      const orc = l.orcamentos;
      const impostoPct = Number(orc?.imposto_total || 0);
      const custoTotal = Number(l.custo_real || 0) * l.qtd;
      const info = fatoresPedido[orc?.id] || { fator: 1, totalPago: 0 };
      const vendaLiquida = Number(l.venda_total || 0) * info.fator;
      const descontoItem = Number(l.venda_total || 0) - vendaLiquida;
      const impostoValor = vendaLiquida * (impostoPct / 100);
      const lucroLiquido = vendaLiquida - custoTotal - impostoValor;
      const percentualLucro = vendaLiquida > 0 ? (lucroLiquido / vendaLiquida) * 100 : 0;
      return { ...l, custoTotal, impostoValor, vendaBruta: Number(l.venda_total || 0), descontoItem, vendaLiquida, lucroLiquido, percentualLucro, totalPagoPedido: info.totalPago };
    });
  }, [linhasNoPeriodo, fatoresPedido]);

  const totais = calculadas.reduce(
    (acc, l) => ({
      custo: acc.custo + l.custoTotal,
      imposto: acc.imposto + l.impostoValor,
      venda: acc.venda + l.vendaLiquida,
      desconto: acc.desconto + l.descontoItem,
      lucro: acc.lucro + l.lucroLiquido
    }),
    { custo: 0, imposto: 0, venda: 0, desconto: 0, lucro: 0 }
  );

  function exportarExcel() {
    const linhasExport = calculadas.map((l) => ({
      Pedido: l.orcamentos?.id,
      Cliente: l.orcamentos?.clientes?.nome || "",
      "Data liberação": l.liberado_em ? new Date(l.liberado_em).toLocaleDateString("pt-BR") : "",
      Código: l.codigo,
      Qtd: l.qtd,
      "Custo (R$)": Number(l.custoTotal.toFixed(2)),
      "Imposto (R$)": Number(l.impostoValor.toFixed(2)),
      "Venda bruta (R$)": Number(l.vendaBruta.toFixed(2)),
      "Desconto rateado (R$)": Number(l.descontoItem.toFixed(2)),
      "Venda líquida (R$)": Number(l.vendaLiquida.toFixed(2)),
      "Lucro Líquido (R$)": Number(l.lucroLiquido.toFixed(2)),
      "% Lucro": Number(l.percentualLucro.toFixed(1)),
      "Valor pago no pedido (R$)": Number(l.totalPagoPedido.toFixed(2))
    }));
    const ws = XLSX.utils.json_to_sheet(linhasExport);
    ws["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 13 }, { wch: 14 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 15 }, { wch: 13 }, { wch: 14 }, { wch: 9 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Custo de Peças");
    const sufixo = periodo === "tudo" ? "todos" : periodo;
    XLSX.writeFile(wb, `relatorio-custo-pecas-${sufixo}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Relatório de Custo"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Relatório de Custo">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor e Gerente veem este relatório.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Relatório de Custo de Peças">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4 no-print">
        <p className="text-sm text-muted">
          Peças já liberadas (com Delivery confirmada) — valores já descontam eventuais descontos aplicados no pedido.
        </p>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs py-2" onClick={exportarExcel}>
            <Download size={14} />
            Exportar Excel
          </button>
          <button className="btn-secondary text-xs py-2" onClick={() => window.print()}>
            <Printer size={14} />
            Imprimir
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4 no-print">
        {PERIODOS.map((p) => (
          <button key={p.id} onClick={() => setPeriodo(p.id)} className={`chip ${periodo === p.id ? "chip-active" : ""}`}>
            {p.label}
          </button>
        ))}
        {periodo === "personalizado" && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" className="field-input py-1.5 text-xs" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
            <span className="text-xs text-muted">até</span>
            <input type="date" className="field-input py-1.5 text-xs" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
          </div>
        )}
      </div>

      <div className="hidden print:block mb-4">
        <p className="font-display font-bold text-lg">Relatório de Custo de Peças</p>
        <p className="text-sm text-muted">
          Período: {PERIODOS.find((p) => p.id === periodo)?.label} · Gerado em {new Date().toLocaleDateString("pt-BR")}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Custo total</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totais.custo)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Imposto total</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totais.imposto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Descontos concedidos</p>
          <p className="font-mono font-bold text-lg" style={{ color: "#D6336C" }}>-{fmtBRL(totais.desconto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Venda líquida total</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totais.venda)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Lucro líquido total</p>
          <p className="font-mono font-bold text-lg" style={{ color: "#2C7C6E" }}>{fmtBRL(totais.lucro)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : calculadas.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhuma peça liberada nesse período.</p>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-3 py-2.5" style={{ width: "22%" }}>Pedido / Cliente</th>
                <th className="text-left px-3 py-2.5" style={{ width: "16%" }}>Peça</th>
                <th className="text-right px-3 py-2.5" style={{ width: "16%" }}>Custo / Imposto</th>
                <th className="text-right px-3 py-2.5" style={{ width: "18%" }}>Venda</th>
                <th className="text-right px-3 py-2.5" style={{ width: "16%" }}>Resultado</th>
                <th className="text-right px-3 py-2.5" style={{ width: "12%" }}>Pago</th>
              </tr>
            </thead>
            <tbody>
              {calculadas.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0 hover:bg-canvas align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-mono text-muted text-xs">#{l.orcamentos?.id}</p>
                    <p className="truncate">{l.orcamentos?.clientes?.nome || "—"}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <p className="font-mono text-xs truncate" style={{ color: "var(--accent)" }}>{l.codigo}</p>
                    <p className="text-muted text-xs">×{l.qtd}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <p>{fmtBRL(l.custoTotal)}</p>
                    <p className="text-muted">imp. {fmtBRL(l.impostoValor)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    {l.descontoItem > 0.004 && (
                      <>
                        <p className="text-muted line-through">{fmtBRL(l.vendaBruta)}</p>
                        <p style={{ color: "#D6336C" }}>-{fmtBRL(l.descontoItem)}</p>
                      </>
                    )}
                    <p className="font-semibold text-sm">{fmtBRL(l.vendaLiquida)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <p className="font-semibold text-sm" style={{ color: "#2C7C6E" }}>{fmtBRL(l.lucroLiquido)}</p>
                    <p className="text-muted">{l.percentualLucro.toFixed(1)}%</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtBRL(l.totalPagoPedido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
