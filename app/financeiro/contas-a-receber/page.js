"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, ArrowLeft, ArrowRight, AlertTriangle, HandCoins, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { getUnidadeAtiva } from "../../../lib/unidade";
import MultiSelect from "../../../components/MultiSelect";
import { ehClienteCustoZero } from "../../../lib/clientes";

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
  // Filtros com várias opções (16/10/2026) — vazio = todos
  const [vendedoresSel, setVendedoresSel] = useState([]);
  const [clientesSel, setClientesSel] = useState([]);

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
        "id, numero_unidade, valor_total, valor_herdado_pai, entregue_em, sem_pagamento, liberado_sem_pagamento_motivo, cliente_id, vendedor_id, validacao_gerente, validacao_gerente_em, clientes(nome, cnpj), perfis!orcamentos_vendedor_id_fkey(nome), liberador:perfis!orcamentos_liberado_sem_pagamento_por_fkey(nome)"
      )
      .eq("entregue", true)
      .order("entregue_em", { ascending: true });
    if (unidadeAtiva) query = query.eq("unidade_id", unidadeAtiva.id);
    const { data: orcs, error } = await query;
    if (error) {
      // fallback sem o join do liberador, caso a FK ainda não exista nesse ambiente
      let q2 = supabase
        .from("orcamentos")
        .select("id, numero_unidade, valor_total, valor_herdado_pai, entregue_em, sem_pagamento, liberado_sem_pagamento_motivo, cliente_id, vendedor_id, validacao_gerente, validacao_gerente_em, clientes(nome, cnpj), perfis!orcamentos_vendedor_id_fkey(nome)")
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
      // J MACEDO ELETRONICA (JM3): o pedido validado pelo gerente no Relatório
      // Resumo sai do "em aberto" (o acerto é feito no fechamento da semana).
      const jm3Validado = ehClienteCustoZero(o.clientes?.cnpj) && o.validacao_gerente === "validado";
      return { ...o, valor_pago: valorPago, valor_aberto: valorAberto, jm3Validado };
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

  // listas dos filtros (de todos os pedidos carregados)
  const vendedoresLista = [...new Map(lista.filter((o) => o.vendedor_id).map((o) => [o.vendedor_id, o.perfis?.nome || "—"])).entries()]
    .map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const clientesLista = [...new Map(lista
    .filter((o) => o.cliente_id != null && (vendedoresSel.length === 0 || vendedoresSel.includes(o.vendedor_id)))
    .map((o) => [String(o.cliente_id), o.clientes?.nome || "—"])).entries()]
    .map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const daSelecao = lista.filter((o) =>
    (vendedoresSel.length === 0 || vendedoresSel.includes(o.vendedor_id)) &&
    (clientesSel.length === 0 || clientesSel.includes(String(o.cliente_id)))
  );

  const emAberto = daSelecao.filter((o) => o.valor_aberto > 0.004 && !o.jm3Validado);
  const jm3Validados = daSelecao.filter((o) => o.valor_aberto > 0.004 && o.jm3Validado);
  const quitados = daSelecao.filter((o) => o.valor_aberto <= 0.004);
  const filtrados = aba === "aberto" ? emAberto : aba === "jm3" ? jm3Validados : quitados;
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

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <button className={`chip ${aba === "aberto" ? "chip-active" : ""}`} onClick={() => setAba("aberto")}>
          Em aberto ({emAberto.length})
        </button>
        <button className={`chip ${aba === "quitados" ? "chip-active" : ""}`} onClick={() => setAba("quitados")}>
          Quitados ({quitados.length})
        </button>
        {jm3Validados.length > 0 && (
          <button className={`chip ${aba === "jm3" ? "chip-active" : ""}`} onClick={() => setAba("jm3")} title="Pedidos da J MACEDO ELETRONICA validados pelo gerente no Relatório Resumo — saem do em aberto">
            J Macedo validados ({jm3Validados.length})
          </button>
        )}
        <span className="hidden md:block w-px h-6 bg-line mx-1" />
        <MultiSelect opcoes={vendedoresLista} valor={vendedoresSel} onChange={setVendedoresSel} rotuloTodos="Todos os vendedores" rotuloItem="vendedores" />
        <MultiSelect opcoes={clientesLista} valor={clientesSel} onChange={setClientesSel} rotuloTodos="Todos os clientes" rotuloItem="clientes" largura="w-64" />
      </div>
      {aba === "jm3" && (
        <p className="text-xs text-muted mb-3 flex items-center gap-1.5">
          <ShieldCheck size={13} style={{ color: "#2C7C6E" }} />
          Pedidos da J MACEDO ELETRONICA LTDA validados pelo gerente no Relatório Resumo. Eles não contam no total em aberto.
        </p>
      )}

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
                      {o.jm3Validado ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }} title={o.validacao_gerente_em ? `Validado em ${new Date(o.validacao_gerente_em).toLocaleString("pt-BR")}` : ""}>
                          VALIDADO PELO GERENTE
                        </span>
                      ) : o.valor_aberto > 0.004 ? (
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
                      <div className="flex items-center justify-end gap-2">
                        {o.valor_aberto > 0.004 && !o.jm3Validado && (
                          <button
                            className="btn-primary py-1.5 px-3 text-xs whitespace-nowrap"
                            onClick={() => router.push(`/estoque/${o.id}?pagamento=1`)}
                          >
                            <HandCoins size={13} />
                            Quitar / Registrar pagamento
                          </button>
                        )}
                        <button
                          className="btn-secondary py-1.5 px-3 text-xs whitespace-nowrap"
                          onClick={() => router.push(`/estoque/${o.id}`)}
                        >
                          Ver pedido
                          <ArrowRight size={13} />
                        </button>
                      </div>
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
