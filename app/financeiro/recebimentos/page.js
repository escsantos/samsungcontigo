"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, Check, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { getUnidadeAtiva } from "../../../lib/unidade";
import { registrarAuditoria } from "../../../lib/auditoria";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RecebimentosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("pendentes");
  const [processando, setProcessando] = useState(null);

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
      .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
      .order("criado_em", { ascending: false });
    if (unidadeAtiva) query = query.eq("unidade_id", unidadeAtiva.id);
    const { data: orcs } = await query;

    // valor pago de verdade: soma direto da tabela de pagamentos + herdado do pedido pai
    const idsPedidos = (orcs || []).map((o) => o.id);
    const { data: pagamentos } = idsPedidos.length
      ? await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsPedidos)
      : { data: [] };
    const pagoPorPedido = {};
    (pagamentos || []).forEach((p) => {
      pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
    });

    const comValorReal = (orcs || [])
      .map((o) => ({ ...o, valor_pago: (pagoPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0) }))
      .filter((o) => o.valor_pago > 0.004);

    setLista(comValorReal);
    setCarregando(false);
  }

  async function confirmar(orcamentoId) {
    setProcessando(orcamentoId);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from("orcamentos")
      .update({ recebimento_confirmado: true, recebimento_confirmado_por: user.id, recebimento_confirmado_em: new Date().toISOString() })
      .eq("id", orcamentoId);
    const pedido = lista.find((o) => o.id === orcamentoId);
    await registrarAuditoria({
      tipoEvento: "status",
      entidade: "financeiro",
      entidadeId: orcamentoId,
      descricao: `Recebimento confirmado no pedido #${pedido?.numero_unidade ?? orcamentoId}: ${fmtBRL(pedido?.valor_pago)}.`
    });
    setProcessando(null);
    carregar();
  }

  async function desfazer(orcamentoId) {
    setProcessando(orcamentoId);
    await supabase.from("orcamentos").update({ recebimento_confirmado: false }).eq("id", orcamentoId);
    const pedido = lista.find((o) => o.id === orcamentoId);
    await registrarAuditoria({
      tipoEvento: "edicao",
      entidade: "financeiro",
      entidadeId: orcamentoId,
      descricao: `Confirmação de recebimento desfeita no pedido #${pedido?.numero_unidade ?? orcamentoId}.`
    });
    setProcessando(null);
    carregar();
  }

  if (perfil === undefined) {
    return <AppShell titulo="Recebimentos"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Recebimentos">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  const filtrados = lista.filter((o) => (aba === "pendentes" ? !o.recebimento_confirmado : o.recebimento_confirmado));

  return (
    <AppShell titulo="Confirmar Recebimentos">
      <button onClick={() => router.push("/financeiro")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para o Dashboard Financeiro
      </button>

      <div className="flex gap-2 mb-4">
        <button className={`chip ${aba === "pendentes" ? "chip-active" : ""}`} onClick={() => setAba("pendentes")}>
          Pendentes ({lista.filter((o) => !o.recebimento_confirmado).length})
        </button>
        <button className={`chip ${aba === "confirmados" ? "chip-active" : ""}`} onClick={() => setAba("confirmados")}>
          Confirmados ({lista.filter((o) => o.recebimento_confirmado).length})
        </button>
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nada por aqui.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Vendedor</th>
                <th className="text-right px-4 py-2.5">Valor total</th>
                <th className="text-right px-4 py-2.5">Valor pago</th>
                <th className="text-left px-4 py-2.5">Data pagamento</th>
                <th className="text-right px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-mono text-muted">#{o.numero_unidade}</td>
                  <td className="px-4 py-2.5 font-medium">{o.clientes?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(o.valor_total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(o.valor_pago)}</td>
                  <td className="px-4 py-2.5 text-muted">{o.data_pagamento ? new Date(o.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {aba === "pendentes" ? (
                      <button className="btn-secondary py-1.5 px-3 text-xs" disabled={processando === o.id} onClick={() => confirmar(o.id)}>
                        <Check size={13} />
                        Confirmar
                      </button>
                    ) : (
                      <button className="text-xs text-muted hover:text-danger" disabled={processando === o.id} onClick={() => desfazer(o.id)}>
                        Desfazer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
