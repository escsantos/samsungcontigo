"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, Check, ArrowLeft, ExternalLink, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { getUnidadeAtiva } from "../../../lib/unidade";
import { registrarAuditoria } from "../../../lib/auditoria";
import { CORES_STATUS, ICONES_STATUS } from "../../../lib/estoque";

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

  // detalhamento completo do pedido (itens + pagamentos com forma/comprovante)
  const [detalhePedido, setDetalhePedido] = useState(null);
  const [itensDetalhe, setItensDetalhe] = useState([]);
  const [pagamentosDetalhe, setPagamentosDetalhe] = useState([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

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

  async function abrirDetalhe(pedido) {
    setDetalhePedido(pedido);
    setCarregandoDetalhe(true);
    setItensDetalhe([]);
    setPagamentosDetalhe([]);
    const [{ data: its }, { data: pags }] = await Promise.all([
      supabase.from("orcamento_itens").select("*").eq("orcamento_id", pedido.id).order("id"),
      supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", pedido.id).order("registrado_em")
    ]);
    setItensDetalhe(its || []);
    setPagamentosDetalhe(pags || []);
    setCarregandoDetalhe(false);
  }

  function fecharDetalhe() {
    setDetalhePedido(null);
    setItensDetalhe([]);
    setPagamentosDetalhe([]);
  }

  async function verComprovante(anexoUrl) {
    if (!anexoUrl) return;
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(anexoUrl, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
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
                <tr
                  key={o.id}
                  className="border-b border-line last:border-0 cursor-pointer hover:bg-canvas transition"
                  onClick={() => abrirDetalhe(o)}
                >
                  <td className="px-4 py-2.5 font-mono text-muted">#{o.numero_unidade}</td>
                  <td className="px-4 py-2.5 font-medium">{o.clientes?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(o.valor_total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(o.valor_pago)}</td>
                  <td className="px-4 py-2.5 text-muted">{o.data_pagamento ? new Date(o.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {aba === "pendentes" ? (
                      <button
                        className="btn-secondary py-1.5 px-3 text-xs"
                        disabled={processando === o.id}
                        onClick={(e) => { e.stopPropagation(); confirmar(o.id); }}
                      >
                        <Check size={13} />
                        Confirmar
                      </button>
                    ) : (
                      <button
                        className="text-xs text-muted hover:text-danger"
                        disabled={processando === o.id}
                        onClick={(e) => { e.stopPropagation(); desfazer(o.id); }}
                      >
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

      <Modal
        open={!!detalhePedido}
        onClose={fecharDetalhe}
        title={detalhePedido ? `Pedido #${detalhePedido.numero_unidade}` : ""}
        tamanho="lg"
      >
        {detalhePedido && (
          <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2.5 flex-wrap">
                {(() => {
                  const cor = CORES_STATUS[detalhePedido.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
                  const IconeStatus = ICONES_STATUS[detalhePedido.status];
                  return (
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1.5 rounded-full"
                      style={{ background: cor.bg, color: cor.fg }}
                    >
                      {IconeStatus && <IconeStatus size={13} />}
                      {detalhePedido.status}
                    </span>
                  );
                })()}
              </div>
              <button
                className="text-xs text-muted hover:text-ink flex items-center gap-1"
                onClick={() => router.push(`/estoque/${detalhePedido.id}`)}
              >
                Abrir pedido completo
                <ExternalLink size={12} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <p className="text-muted mb-0.5">Cliente</p>
                <p className="font-medium">{detalhePedido.clientes?.nome || "—"}</p>
              </div>
              <div>
                <p className="text-muted mb-0.5">Vendedor</p>
                <p className="font-medium">{detalhePedido.perfis?.nome || "—"}</p>
              </div>
              <div>
                <p className="text-muted mb-0.5">Valor total</p>
                <p className="font-mono font-semibold">{fmtBRL(detalhePedido.valor_total)}</p>
              </div>
              <div>
                <p className="text-muted mb-0.5">Valor pago</p>
                <p className="font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(detalhePedido.valor_pago)}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Peças do pedido</p>
              {carregandoDetalhe ? (
                <p className="text-xs text-muted">Carregando...</p>
              ) : itensDetalhe.length === 0 ? (
                <p className="text-xs text-muted">Nenhum item encontrado.</p>
              ) : (
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                        <th className="text-left px-3 py-2">Peça</th>
                        <th className="text-center px-3 py-2">Qtd</th>
                        <th className="text-right px-3 py-2">Venda</th>
                      </tr>
                    </thead>
                    <tbody>
                      {itensDetalhe.map((i) => (
                        <tr key={i.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">
                            <p className="font-mono font-medium truncate">{i.codigo}</p>
                            <p className="text-muted truncate">{i.descricao_resumida}</p>
                          </td>
                          <td className="px-3 py-2 text-center">{i.qtd}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtBRL(i.venda_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Pagamentos registrados</p>
              {carregandoDetalhe ? (
                <p className="text-xs text-muted">Carregando...</p>
              ) : pagamentosDetalhe.length === 0 ? (
                <p className="text-xs text-muted">Nenhum pagamento registrado — valor herdado de outro pedido.</p>
              ) : (
                <div className="border border-line rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                        <th className="text-left px-3 py-2">Forma de pagamento</th>
                        <th className="text-left px-3 py-2">Data</th>
                        <th className="text-right px-3 py-2">Valor</th>
                        <th className="text-right px-3 py-2">Comprovante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentosDetalhe.map((p) => (
                        <tr key={p.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 font-medium">{p.forma_pagamento || "—"}</td>
                          <td className="px-3 py-2 text-muted">
                            {p.data_pagamento ? new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(p.valor)}</td>
                          <td className="px-3 py-2 text-right">
                            {p.anexo_url ? (
                              <button
                                className="inline-flex items-center gap-1 text-muted hover:text-ink"
                                onClick={() => verComprovante(p.anexo_url)}
                                title="Ver comprovante"
                              >
                                <Paperclip size={12} />
                                Ver
                              </button>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
