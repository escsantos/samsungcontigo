"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ArrowLeft, ChevronDown, Download, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../../lib/supabaseClient";
import AppShell from "../../../../components/AppShell";
import SeloConfirmacao from "../../../../components/SeloConfirmacao";
import { getUnidadeAtiva } from "../../../../lib/unidade";

// Pagamentos ao fabricante confirmados (16/10/2026): histórico das semanas
// pagas, com o selo de quem confirmou (nome, login, data e hora) e a
// relação das peças/notas fiscais de cada pagamento.

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDia(d) {
  return d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
}

export default function PagamentosFabricanteConfirmadosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [abertos, setAbertos] = useState({});
  const [itensPorPagamento, setItensPorPagamento] = useState({});

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (["Administrador", "Financeiro"].includes(p?.cargo)) carregar();
    })();
  }, []);

  async function carregar() {
    setCarregando(true);
    const unidadeAtiva = getUnidadeAtiva();
    const { data } = await supabase
      .from("fabricante_pagamentos")
      .select("*")
      .eq("unidade_id", unidadeAtiva?.id || 0)
      .order("semana_inicio", { ascending: false })
      .order("confirmado_em", { ascending: false });
    setLista(data || []);
    setCarregando(false);
  }

  async function carregarItens(id) {
    if (itensPorPagamento[id]) return itensPorPagamento[id];
    const { data } = await supabase
      .from("orcamento_itens")
      .select("id, codigo, descricao_resumida, qtd, custo_real, orcamentos(numero_unidade, nota_fiscal_numero, clientes(nome))")
      .eq("fabricante_pagamento_id", id)
      .order("id");
    const itens = data || [];
    setItensPorPagamento((m) => ({ ...m, [id]: itens }));
    return itens;
  }

  async function alternar(id) {
    const abrir = !abertos[id];
    setAbertos((a) => ({ ...a, [id]: abrir }));
    if (abrir) carregarItens(id);
  }

  async function exportar(pg) {
    const itens = await carregarItens(pg.id);
    const linhas = itens.map((i) => ({
      Semana: pg.semana_rotulo,
      "Período": `${fmtDia(pg.semana_inicio)} a ${fmtDia(pg.semana_fim)}`,
      Pedido: i.orcamentos?.numero_unidade,
      "Nota Fiscal": i.orcamentos?.nota_fiscal_numero || "",
      Cliente: i.orcamentos?.clientes?.nome || "",
      "Código": i.codigo || "",
      "Descrição": i.descricao_resumida || "",
      Qtd: Number(i.qtd || 0),
      "Custo (R$)": Number((Number(i.custo_real || 0) * Number(i.qtd || 0)).toFixed(2)),
      "Data do pagamento": fmtDia(pg.data_pagamento),
      "Confirmado por": `${pg.confirmado_por_nome} (${pg.confirmado_por_login})`,
      "Confirmado em": new Date(pg.confirmado_em).toLocaleString("pt-BR")
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, pg.semana_rotulo || "Pagamento");
    XLSX.writeFile(wb, `pagamento-fabricante-${pg.semana_rotulo || pg.id}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Pagamentos ao Fabricante Confirmados"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }
  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Pagamentos ao Fabricante Confirmados">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Pagamentos ao Fabricante Confirmados">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <button onClick={() => router.push("/financeiro/fornecedor")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Voltar para o Pagamento ao Fabricante
        </button>
        <button className="btn-secondary text-xs py-2" onClick={carregar} disabled={carregando}>
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : lista.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted">Nenhum pagamento ao fabricante confirmado pelo novo processo ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((pg) => {
            const aberto = !!abertos[pg.id];
            const itens = itensPorPagamento[pg.id];
            return (
              <div key={pg.id} className="card overflow-hidden">
                <div className="p-4 flex items-center justify-between flex-wrap gap-4">
                  <button onClick={() => alternar(pg.id)} className="flex items-center gap-3 text-left">
                    <ChevronDown size={16} className="text-muted transition-transform" style={{ transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }} />
                    <span className="font-mono font-black text-3xl leading-none px-3 py-2 rounded-xl" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
                      {pg.semana_rotulo}
                    </span>
                    <div>
                      <p className="font-display font-semibold text-sm">Semana de {fmtDia(pg.semana_inicio)} a {fmtDia(pg.semana_fim)}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {pg.qtd_pedidos} pedido(s) · {pg.qtd_pecas} peça(s) · Total: <b className="text-ink font-mono">{fmtBRL(pg.valor_total)}</b>
                      </p>
                      {pg.observacao && <p className="text-xs text-muted mt-0.5">Obs.: {pg.observacao}</p>}
                    </div>
                  </button>
                  <div className="flex items-center gap-3 flex-wrap">
                    <SeloConfirmacao nome={pg.confirmado_por_nome} login={pg.confirmado_por_login} confirmadoEm={pg.confirmado_em} dataPagamento={pg.data_pagamento} />
                    <button className="btn-secondary text-xs py-1.5" onClick={() => exportar(pg)} title="Exportar as peças deste pagamento">
                      <Download size={13} /> Excel
                    </button>
                  </div>
                </div>
                {aberto && (
                  <div className="border-t border-line overflow-x-auto">
                    {!itens ? (
                      <p className="text-xs text-muted p-4">Carregando...</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                            <th className="text-left px-4 py-2">Pedido</th>
                            <th className="text-left px-4 py-2">Nota Fiscal</th>
                            <th className="text-left px-4 py-2">Cliente</th>
                            <th className="text-left px-4 py-2">Código</th>
                            <th className="text-left px-4 py-2">Descrição</th>
                            <th className="text-center px-4 py-2">Qtd</th>
                            <th className="text-right px-4 py-2">Custo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itens.map((i) => (
                            <tr key={i.id} className="border-b border-line last:border-0">
                              <td className="px-4 py-2 font-mono text-muted">#{i.orcamentos?.numero_unidade}</td>
                              <td className="px-4 py-2 font-mono font-semibold" style={{ color: "var(--accent)" }}>{i.orcamentos?.nota_fiscal_numero || "—"}</td>
                              <td className="px-4 py-2">{i.orcamentos?.clientes?.nome || "—"}</td>
                              <td className="px-4 py-2 font-mono" style={{ color: "var(--accent)" }}>{i.codigo}</td>
                              <td className="px-4 py-2 text-muted max-w-[260px] truncate">{i.descricao_resumida || "—"}</td>
                              <td className="px-4 py-2 text-center">{i.qtd}</td>
                              <td className="px-4 py-2 text-right font-mono">{fmtBRL(Number(i.custo_real || 0) * Number(i.qtd || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
