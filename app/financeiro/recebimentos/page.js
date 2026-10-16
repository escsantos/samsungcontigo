"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, Check, ArrowLeft, ExternalLink, Paperclip, FileText, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { getUnidadeAtiva } from "../../../lib/unidade";
import { registrarAuditoria } from "../../../lib/auditoria";
import { CORES_STATUS, ICONES_STATUS, FORMAS_PAGAMENTO, BANDEIRAS_CARTAO, PARCELAS_CARTAO, textoDataPagamento } from "../../../lib/estoque";

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

  // Filtros (16/10/2026): Nota Fiscal (lista das NFs da tela) e Cliente
  const [filtroNF, setFiltroNF] = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  // Pop-up de confirmação: o Financeiro revisa a forma de pagamento e
  // informa a data em que cada pagamento entrou.
  const [modalConfirmar, setModalConfirmar] = useState(null);
  const [pagsConfirmar, setPagsConfirmar] = useState([]);
  const [dataUnicaConfirmar, setDataUnicaConfirmar] = useState("");
  const [erroConfirmar, setErroConfirmar] = useState("");
  // linhas fazendo a animação de saída (baixa)
  const [saindo, setSaindo] = useState([]);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (["Administrador", "Financeiro"].includes(p?.cargo)) carregar();
    })();
  }, []);

  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true);
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
      ? await supabase.from("pagamentos_orcamento").select("id, orcamento_id, valor, anexo_url").in("orcamento_id", idsPedidos)
      : { data: [] };
    // comprovantes extras (vários por pagamento) ficam em pagamento_anexos — é onde a tela do Estoque grava
    const idsPag = (pagamentos || []).map((p) => p.id);
    const pedidoDoPagamento = {};
    (pagamentos || []).forEach((p) => { pedidoDoPagamento[p.id] = p.orcamento_id; });
    const { data: extras } = idsPag.length
      ? await supabase.from("pagamento_anexos").select("pagamento_id, anexo_url").in("pagamento_id", idsPag)
      : { data: [] };
    const pagoPorPedido = {};
    const anexosPorPedido = {};
    (extras || []).forEach((a) => {
      const ped = pedidoDoPagamento[a.pagamento_id];
      if (ped && a.anexo_url) anexosPorPedido[ped] = [...(anexosPorPedido[ped] || []), a.anexo_url];
    });
    (pagamentos || []).forEach((p) => {
      pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
      if (p.anexo_url && !(anexosPorPedido[p.orcamento_id] || []).includes(p.anexo_url)) anexosPorPedido[p.orcamento_id] = [...(anexosPorPedido[p.orcamento_id] || []), p.anexo_url];
    });

    const comValorReal = (orcs || [])
      .map((o) => {
        // comprovantes: um por pagamento + o anexo antigo direto no pedido (se houver)
        const anexos = [...(anexosPorPedido[o.id] || [])];
        if (o.anexo_pagamento_url && !anexos.includes(o.anexo_pagamento_url)) anexos.push(o.anexo_pagamento_url);
        return { ...o, anexos, valor_pago: (pagoPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0) };
      })
      .filter((o) => o.valor_pago > 0.004);

    setLista(comValorReal);
    setCarregando(false);
  }

  // Abre o pop-up de confirmação com os pagamentos do pedido
  async function confirmar(orcamentoId) {
    const pedido = lista.find((o) => o.id === orcamentoId);
    if (!pedido) return;
    setErroConfirmar("");
    setDataUnicaConfirmar("");
    setPagsConfirmar([]);
    setModalConfirmar(pedido);
    const { data: pags } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", orcamentoId).order("registrado_em");
    setPagsConfirmar((pags || []).map((p) => ({
      ...p,
      _forma: p.forma_pagamento,
      _bandeira: p.bandeira_cartao || BANDEIRAS_CARTAO[0],
      _parcelas: p.parcelas || 1,
      _data: p.data_pagamento || ""
    })));
  }

  function alterarPagConfirmar(id, campo, valor) {
    setPagsConfirmar((lista) => lista.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  function animarSaida(orcamentoId) {
    setSaindo((s) => [...s, orcamentoId]);
    setTimeout(async () => {
      await carregar(true);
      setSaindo((s) => s.filter((x) => x !== orcamentoId));
    }, 900);
  }

  async function salvarConfirmacao() {
    const pedido = modalConfirmar;
    if (!pedido) return;
    const semPagamentos = pagsConfirmar.length === 0;
    if (semPagamentos ? !dataUnicaConfirmar : pagsConfirmar.some((p) => !p._data)) {
      setErroConfirmar("Informe a data do recebimento de cada pagamento.");
      return;
    }
    setProcessando(pedido.id);
    setErroConfirmar("");
    const { data: { user } } = await supabase.auth.getUser();

    const mudancas = [];
    for (const p of pagsConfirmar) {
      const ehCredito = p._forma === "Cartão de Crédito";
      const novo = {
        forma_pagamento: p._forma,
        bandeira_cartao: ehCredito ? p._bandeira : null,
        parcelas: ehCredito ? Number(p._parcelas) : null,
        data_pagamento: p._data
      };
      const { error } = await supabase.from("pagamentos_orcamento").update(novo).eq("id", p.id);
      if (error) {
        setProcessando(null);
        setErroConfirmar("Falha ao salvar o pagamento: " + error.message);
        return;
      }
      if (p._forma !== p.forma_pagamento) mudancas.push(`${p.forma_pagamento} → ${p._forma}`);
    }

    const datas = semPagamentos ? [dataUnicaConfirmar] : pagsConfirmar.map((p) => p._data);
    const ultimaData = datas.sort().slice(-1)[0];
    const { error: errOrc } = await supabase
      .from("orcamentos")
      .update({
        recebimento_confirmado: true,
        recebimento_confirmado_por: user.id,
        recebimento_confirmado_em: new Date().toISOString(),
        data_pagamento: ultimaData
      })
      .eq("id", pedido.id);
    if (errOrc) {
      setProcessando(null);
      setErroConfirmar("Falha ao confirmar o recebimento: " + errOrc.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "status",
      entidade: "financeiro",
      entidadeId: pedido.id,
      descricao: `Recebimento confirmado no pedido #${pedido.numero_unidade}: ${fmtBRL(pedido.valor_pago)} (data(s): ${datas.map((d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR")).join(", ")})${mudancas.length ? `. Forma alterada: ${mudancas.join("; ")}` : ""}.`
    });
    setProcessando(null);
    setModalConfirmar(null);
    animarSaida(pedido.id);
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
    animarSaida(orcamentoId);
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
    // junta o anexo do próprio pagamento com os de pagamento_anexos (tela do Estoque)
    const idsPag = (pags || []).map((p) => p.id);
    const { data: extras } = idsPag.length
      ? await supabase.from("pagamento_anexos").select("pagamento_id, anexo_url").in("pagamento_id", idsPag)
      : { data: [] };
    const comAnexos = (pags || []).map((p) => ({
      ...p,
      anexos: [...(p.anexo_url ? [p.anexo_url] : []), ...(extras || []).filter((a) => a.pagamento_id === p.id && a.anexo_url).map((a) => a.anexo_url)]
        .filter((v, i, arr) => arr.indexOf(v) === i)
    }));
    setItensDetalhe(its || []);
    setPagamentosDetalhe(comAnexos);
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

  const daAba = lista.filter((o) => (aba === "pendentes" ? !o.recebimento_confirmado : o.recebimento_confirmado));
  const nfsDaAba = [...new Set(daAba.map((o) => o.nota_fiscal_numero).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true }));
  const clientesDaAba = [...new Map(daAba.filter((o) => o.cliente_id != null).map((o) => [String(o.cliente_id), o.clientes?.nome || "—"])).entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const filtrados = daAba.filter((o) => {
    if (filtroNF && String(o.nota_fiscal_numero || "") !== filtroNF) return false;
    if (filtroCliente && String(o.cliente_id) !== filtroCliente) return false;
    return true;
  });

  return (
    <AppShell titulo="Confirmar Recebimentos">
      <button onClick={() => router.push("/financeiro")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para o Dashboard Financeiro
      </button>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <button className={`chip ${aba === "pendentes" ? "chip-active" : ""}`} onClick={() => { setAba("pendentes"); setFiltroNF(""); }}>
          Pendentes ({lista.filter((o) => !o.recebimento_confirmado).length})
        </button>
        <button className={`chip ${aba === "confirmados" ? "chip-active" : ""}`} onClick={() => { setAba("confirmados"); setFiltroNF(""); }}>
          Confirmados ({lista.filter((o) => o.recebimento_confirmado).length})
        </button>
        <select className="field-input py-1.5 text-xs w-auto" value={filtroNF} onChange={(e) => setFiltroNF(e.target.value)} title="Nota Fiscal">
          <option value="">Nota Fiscal: todas</option>
          {nfsDaAba.map((nf) => <option key={nf} value={String(nf)}>NF {nf}</option>)}
        </select>
        <select className="field-input py-1.5 text-xs w-auto max-w-[260px]" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} title="Cliente">
          <option value="">Cliente: todos</option>
          {clientesDaAba.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <button className="btn-secondary text-xs py-1.5 ml-auto" onClick={() => carregar()} disabled={carregando} title="Atualizar a lista">
          <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
          Atualizar
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
                <th className="text-left px-4 py-2.5">NF</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Vendedor</th>
                <th className="text-right px-4 py-2.5">Valor total</th>
                <th className="text-right px-4 py-2.5">Valor pago</th>
                <th className="text-left px-4 py-2.5">Data pagamento</th>
                <th className="text-center px-4 py-2.5">Comprovante</th>
                <th className="text-right px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((o) => (
                <tr
                  key={o.id}
                  className={`border-b border-line last:border-0 cursor-pointer hover:bg-canvas transition ${saindo.includes(o.id) ? "linha-baixa-saindo" : ""}`}
                  onClick={() => abrirDetalhe(o)}
                >
                  <td className="px-4 py-2.5 font-mono text-muted">#{o.numero_unidade}</td>
                  <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap" style={{ color: o.nota_fiscal_numero ? "var(--accent)" : undefined }}>{o.nota_fiscal_numero || <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-2.5 font-medium">{o.clientes?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(o.valor_total)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(o.valor_pago)}</td>
                  <td className="px-4 py-2.5 text-muted">{o.data_pagamento ? new Date(o.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-4 py-2.5 text-center">
                    {o.anexos.length === 0 ? (
                      <span className="text-xs text-danger" title="Nenhum comprovante anexado">sem anexo</span>
                    ) : (
                      <button
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap hover:opacity-80"
                        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                        title={o.anexos.length === 1 ? "Abrir o comprovante anexado" : "Ver os comprovantes no detalhe do pedido"}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (o.anexos.length === 1) verComprovante(o.anexos[0]);
                          else abrirDetalhe(o);
                        }}
                      >
                        <FileText size={13} />
                        {o.anexos.length === 1 ? "Ver comprovante" : `${o.anexos.length} comprovantes`}
                      </button>
                    )}
                  </td>
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

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
              <div>
                <p className="text-muted mb-0.5">Nota Fiscal</p>
                <p className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{detalhePedido.nota_fiscal_numero || "—"}</p>
              </div>
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
                        <th className="text-left px-3 py-2">Data pagamento</th>
                        <th className="text-right px-3 py-2">Valor</th>
                        <th className="text-right px-3 py-2">Comprovante</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagamentosDetalhe.map((p) => (
                        <tr key={p.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2 font-medium">
                            {p.forma_pagamento || "—"}
                            {p.bandeira_cartao && (
                              <span className="block text-[10.5px] text-muted font-normal">{p.bandeira_cartao} — {p.parcelas || 1}x</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {textoDataPagamento(p)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(p.valor)}</td>
                          <td className="px-3 py-2 text-right">
                            {p.anexos.length > 0 ? (
                              <div className="inline-flex flex-wrap justify-end gap-1.5">
                                {p.anexos.map((a, idx) => (
                                  <button
                                    key={a}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg hover:opacity-80"
                                    style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                                    onClick={() => verComprovante(a)}
                                    title="Ver comprovante"
                                  >
                                    <Paperclip size={12} />
                                    {p.anexos.length > 1 ? `Comprovante ${idx + 1}` : "Ver comprovante"}
                                  </button>
                                ))}
                              </div>
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

      <Modal
        open={!!modalConfirmar}
        onClose={() => !processando && setModalConfirmar(null)}
        title={modalConfirmar ? `Confirmar recebimento — Pedido #${modalConfirmar.numero_unidade}` : ""}
        tamanho="lg"
      >
        {modalConfirmar && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div><p className="text-muted">Cliente</p><p className="font-medium">{modalConfirmar.clientes?.nome || "—"}</p></div>
              <div><p className="text-muted">Nota Fiscal</p><p className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{modalConfirmar.nota_fiscal_numero || "—"}</p></div>
              <div><p className="text-muted">Valor total</p><p className="font-mono">{fmtBRL(modalConfirmar.valor_total)}</p></div>
              <div><p className="text-muted">Valor pago</p><p className="font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(modalConfirmar.valor_pago)}</p></div>
            </div>

            <p className="text-xs text-muted">Confira a forma de pagamento (corrija se foi registrada errada) e informe a data em que cada pagamento entrou.</p>

            {pagsConfirmar.length === 0 ? (
              <div className="max-w-xs">
                <label className="field-label">Data do recebimento *</label>
                <input type="date" className="field-input" value={dataUnicaConfirmar} onChange={(e) => setDataUnicaConfirmar(e.target.value)} />
              </div>
            ) : (
              <div className="border border-line rounded-lg overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                      <th className="text-left px-3 py-2">Registrado em</th>
                      <th className="text-left px-3 py-2">Forma de pagamento</th>
                      <th className="text-right px-3 py-2">Valor</th>
                      <th className="text-left px-3 py-2">Data do recebimento *</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagsConfirmar.map((p) => (
                      <tr key={p.id} className="border-b border-line last:border-0 align-top">
                        <td className="px-3 py-2 text-muted whitespace-nowrap">{p.registrado_em ? new Date(p.registrado_em).toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-3 py-2">
                          <select className="field-input py-1 text-xs" value={p._forma} onChange={(e) => alterarPagConfirmar(p.id, "_forma", e.target.value)}>
                            {[...new Set([p.forma_pagamento, ...FORMAS_PAGAMENTO])].map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                          {p._forma === "Cartão de Crédito" && (
                            <div className="flex gap-1 mt-1">
                              <select className="field-input py-1 text-xs" value={p._bandeira} onChange={(e) => alterarPagConfirmar(p.id, "_bandeira", e.target.value)}>
                                {BANDEIRAS_CARTAO.map((b) => <option key={b} value={b}>{b}</option>)}
                              </select>
                              <select className="field-input py-1 text-xs w-16" value={p._parcelas} onChange={(e) => alterarPagConfirmar(p.id, "_parcelas", Number(e.target.value))}>
                                {PARCELAS_CARTAO.map((n) => <option key={n} value={n}>{n}x</option>)}
                              </select>
                            </div>
                          )}
                          {p._forma !== p.forma_pagamento && (
                            <p className="text-[10.5px] mt-1" style={{ color: "#C2801F" }}>Alterado (era {p.forma_pagamento})</p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtBRL(p.valor)}</td>
                        <td className="px-3 py-2">
                          <input type="date" className={`field-input py-1 text-xs ${p._data ? "" : "border-danger"}`} value={p._data} onChange={(e) => alterarPagConfirmar(p.id, "_data", e.target.value)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {erroConfirmar && <p className="text-sm text-danger">{erroConfirmar}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setModalConfirmar(null)} disabled={!!processando}>Cancelar</button>
              <button className="btn-primary" onClick={salvarConfirmacao} disabled={!!processando}>
                <Check size={15} />
                {processando ? "Confirmando..." : "Confirmar recebimento"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
