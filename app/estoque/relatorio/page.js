"use client";
import { useEffect, useMemo, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RelatorioCustoPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase
        .from("orcamento_itens")
        .select("*, orcamentos(id, margem, imposto_total, criado_em, clientes(nome))")
        .eq("liberado", true)
        .order("orcamento_id", { ascending: false });
      setLinhas(data || []);
      setCarregando(false);
    })();
  }, []);

  const calculadas = useMemo(() => {
    return linhas.map((l) => {
      const orc = l.orcamentos;
      const impostoPct = Number(orc?.imposto_total || 0);
      const custoTotal = Number(l.custo_real || 0) * l.qtd;
      const vendaTotal = Number(l.venda_total || 0);
      const impostoValor = vendaTotal * (impostoPct / 100);
      const lucroLiquido = vendaTotal - custoTotal - impostoValor;
      const percentualLucro = vendaTotal > 0 ? (lucroLiquido / vendaTotal) * 100 : 0;
      return { ...l, custoTotal, impostoValor, lucroLiquido, percentualLucro };
    });
  }, [linhas]);

  const totais = calculadas.reduce(
    (acc, l) => ({
      custo: acc.custo + l.custoTotal,
      imposto: acc.imposto + l.impostoValor,
      venda: acc.venda + Number(l.venda_total || 0),
      lucro: acc.lucro + l.lucroLiquido
    }),
    { custo: 0, imposto: 0, venda: 0, lucro: 0 }
  );

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
      <p className="text-sm text-muted mb-4">
        Peças já liberadas (com Delivery confirmada) — use para conferência e pagamento ao fornecedor.
      </p>

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
          <p className="text-sm text-muted p-6 text-center">Nenhuma peça liberada ainda.</p>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-360px)]">
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
