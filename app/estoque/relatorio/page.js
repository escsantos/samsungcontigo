"use client";
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";

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
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase
        .from("orcamento_itens")
        .select("*, orcamentos(id, margem, imposto_total, criado_em, clientes(nome))")
        .eq("liberado", true)
        .order("liberado_em", { ascending: false });
      setLinhas(data || []);
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
      const vendaTotal = Number(l.venda_total || 0);
      const impostoValor = vendaTotal * (impostoPct / 100);
      const lucroLiquido = vendaTotal - custoTotal - impostoValor;
      const percentualLucro = vendaTotal > 0 ? (lucroLiquido / vendaTotal) * 100 : 0;
      return { ...l, custoTotal, impostoValor, lucroLiquido, percentualLucro };
    });
  }, [linhasNoPeriodo]);

  const totais = calculadas.reduce(
    (acc, l) => ({
      custo: acc.custo + l.custoTotal,
      imposto: acc.imposto + l.impostoValor,
      venda: acc.venda + Number(l.venda_total || 0),
      lucro: acc.lucro + l.lucroLiquido
    }),
    { custo: 0, imposto: 0, venda: 0, lucro: 0 }
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
      "Venda (R$)": Number(Number(l.venda_total || 0).toFixed(2)),
      "Lucro Líquido (R$)": Number(l.lucroLiquido.toFixed(2)),
      "% Lucro": Number(l.percentualLucro.toFixed(1))
    }));
    const ws = XLSX.utils.json_to_sheet(linhasExport);
    ws["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 13 }, { wch: 14 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 9 }];
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
          Peças já liberadas (com Delivery confirmada) — use para conferência e pagamento ao fornecedor.
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

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Custo total</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totais.custo)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Imposto total</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totais.imposto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Venda total</p>
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
          <div className="overflow-auto max-h-[calc(100vh-420px)] print:max-h-none print:overflow-visible">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Pedido</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Cliente</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Código</th>
                  <th className="sticky top-0 bg-canvas text-center px-4 py-2.5">Qtd</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">Custo</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">Imposto</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">Venda</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">Lucro Líquido</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">% Lucro</th>
                </tr>
              </thead>
              <tbody>
                {calculadas.map((l) => (
                  <tr key={l.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-2.5 font-mono text-muted">#{l.orcamentos?.id}</td>
                    <td className="px-4 py-2.5">{l.orcamentos?.clientes?.nome || "—"}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: "var(--accent)" }}>{l.codigo}</td>
                    <td className="px-4 py-2.5 text-center">{l.qtd}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(l.custoTotal)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(l.impostoValor)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(l.venda_total)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(l.lucroLiquido)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{l.percentualLucro.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
