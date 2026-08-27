"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, ArrowLeft, ArrowRight, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { getUnidadeAtiva } from "../../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function ContasAReceberPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("aberto");

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
    let query = supabase
      .from("orcamentos")
      .select(
        "id, numero_unidade, valor_total, valor_herdado_pai, entregue_em, sem_pagamento, liberado_sem_pagamento_motivo, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome), liberador:perfis!orcamentos_liberado_sem_pagamento_por_fkey(nome)"
      )
      .eq("entregue", true)
      .order("entregue_em", { ascending: true });
    if (unidadeAtiva) query = query.eq("unidade_id", unidadeAtiva.id);
    const { data: orcs, error } = await query;
    if (error) {
      // fallback sem o join do liberador, caso a FK ainda não exista nesse ambiente
      let q2 = supabase
        .from("orcamentos")
        .select("id, numero_unidade, valor_total, valor_herdado_pai, entregue_em, sem_pagamento, liberado_sem_pagamento_motivo, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
        .eq("entregue", true)
        .order("entregue_em", { ascending: true });
      if (unidadeAtiva) q2 = q2.eq("unidade_id", unidadeAtiva.id);
      const r2 = await q2;
      await montarLista(r2.data || []);
      return;
    }
    await montarLista(orcs || []);
  }

  async function montarLista(orcs) {
    const idsPedidos = orcs.map((o) => o.id);
    const { data: pagamentos } = idsPedidos.length
      ? await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsPedidos)
      : { data: [] };
    const pagoPorPedido = {};
    (pagamentos || []).forEach((p) => {
      pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
    });

    const comValorReal = orcs.map((o) => {
      const valorPago = (pagoPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0);
      const valorAberto = Number(o.valor_total || 0) - valorPago;
      return { ...o, valor_pago: valorPago, valor_aberto: valorAberto };
    });

    setLista(comValorReal);
    setCarregando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Contas a Receber"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Contas a Receber">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  const emAberto = lista.filter((o) => o.valor_aberto > 0.004);
  const quitados = lista.filter((o) => o.valor_aberto <= 0.004);
  const filtrados = aba === "aberto" ? emAberto : quitados;
  const totalEmAberto = emAberto.reduce((s, o) => s + o.valor_aberto, 0);

  return (
    <AppShell titulo="Contas a Receber">
      <button onClick={() => router.push("/financeiro")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para o Dashboard Financeiro
      </button>

      <p className="text-sm text-muted mb-4">
        Pedidos já entregues ao cliente, com o valor pago e o valor que ainda está em aberto — inclusive os que foram liberados para faturamento ou entrega sem o pagamento total.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <div className="card p-4">
          <p className="text-[10.5px] font-mono uppercase tracking-wide text-muted mb-1">Pedidos em aberto</p>
          <p className="text-2xl font-display font-semibold">{emAberto.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-[10.5px] font-mono uppercase tracking-wide text-muted mb-1">Total em aberto</p>
          <p className="text-2xl font-display font-semibold" style={{ color: "var(--danger)" }}>{fmtBRL(totalEmAberto)}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button className={`chip ${aba === "aberto" ? "chip-active" : ""}`} onClick={() => setAba("aberto")}>
          Em aberto ({emAberto.length})
        </button>
        <button className={`chip ${aba === "quitados" ? "chip-active" : ""}`} onClick={() => setAba("quitados")}>
          Quitados ({quitados.length})
        </button>
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nada por aqui.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-4 py-2.5">Pedido</th>
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">Vendedor</th>
                  <th className="text-left px-4 py-2.5">Entregue em</th>
                  <th className="text-right px-4 py-2.5">Valor total</th>
                  <th className="text-right px-4 py-2.5">Valor pago</th>
                  <th className="text-right px-4 py-2.5">Valor em aberto</th>
                  <th className="text-right px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0 align-top">
                    <td className="px-4 py-2.5 font-mono text-muted">#{o.numero_unidade}</td>
                    <td className="px-4 py-2.5 font-medium">{o.clientes?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{fmtData(o.entregue_em)}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(o.valor_total)}</td>
                    <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#2C7C6E" }}>{fmtBRL(o.valor_pago)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {o.valor_aberto > 0.004 ? (
                        <div>
                          <span className="font-mono font-semibold text-danger">{fmtBRL(o.valor_aberto)}</span>
                          {o.sem_pagamento && o.liberado_sem_pagamento_motivo && (
                            <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1 justify-end">
                              <AlertTriangle size={11} />
                              Liberado{o.liberador?.nome ? ` por ${o.liberador.nome}` : ""}: {o.liberado_sem_pagamento_motivo}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-muted">{fmtBRL(0)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        className="btn-secondary py-1.5 px-3 text-xs whitespace-nowrap"
                        onClick={() => router.push(`/estoque/${o.id}`)}
                      >
                        Ver pedido
                        <ArrowRight size={13} />
                      </button>
                    </td>
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
