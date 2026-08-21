"use client";
import { useEffect, useState } from "react";
import { Search, ShieldAlert, Receipt, Plus, Trash2, Pencil, Save, ExternalLink, Paperclip, Check, RefreshCw } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { CORES_STATUS, ICONES_STATUS, FORMAS_PAGAMENTO } from "../../lib/estoque";
import { getUnidadeAtiva } from "../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function PagamentosPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [numeroBusca, setNumeroBusca] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [orcamento, setOrcamento] = useState(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [outraUnidade, setOutraUnidade] = useState(false);
  const [pagamentos, setPagamentos] = useState([]);
  const [erro, setErro] = useState("");

  const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[0]);
  const [valorPagamento, setValorPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [arquivoAnexo, setArquivoAnexo] = useState(null);
  const [processando, setProcessando] = useState(false);

  const [editandoPagamento, setEditandoPagamento] = useState(null);
  const [edicaoPagamento, setEdicaoPagamento] = useState({});
  const [pagamentoConfirmado, setPagamentoConfirmado] = useState(null);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  async function buscarPedido(e) {
    e?.preventDefault();
    const n = parseInt(numeroBusca, 10);
    if (!n) return;
    const unidadeAtiva = getUnidadeAtiva();
    if (!unidadeAtiva) return;
    setBuscando(true);
    setPagamentoConfirmado(null);
    setErro("");
    setNaoEncontrado(false);
    setOutraUnidade(false);
    const { data: orcs } = await supabase.rpc("buscar_orcamento_pagamento", { p_numero: n, p_unidade_id: unidadeAtiva.id });
    const orc = orcs?.[0];
    if (!orc) {
      setOrcamento(null);
      setNaoEncontrado(true);
      setBuscando(false);
      return;
    }
    if (orc.cliente_id) {
      const { data: cliente } = await supabase.from("clientes").select("nome, celular, email").eq("id", orc.cliente_id).single();
      orc.clientes = cliente || null;
    }
    setOrcamento(orc);
    const { data: pags } = await supabase.rpc("buscar_pagamentos_pagamento", { pid: orc.id });
    setPagamentos(pags || []);
    const totalPago = (pags || []).reduce((s, p) => s + Number(p.valor), 0);
    const faltando = Number(orc.valor_total || 0) - totalPago;
    setValorPagamento(faltando > 0 ? faltando.toFixed(2) : "");
    setBuscando(false);
  }

  async function recarregarPedido() {
    if (!orcamento) return;
    const { data: orcs } = await supabase.rpc("buscar_orcamento_pagamento", { p_numero: orcamento.numero_unidade, p_unidade_id: orcamento.unidade_id });
    const orc = orcs?.[0];
    if (orc && orc.cliente_id) {
      const { data: cliente } = await supabase.from("clientes").select("nome, celular, email").eq("id", orc.cliente_id).single();
      orc.clientes = cliente || null;
    }
    setOrcamento(orc || orcamento);
    const { data: pags } = await supabase.rpc("buscar_pagamentos_pagamento", { pid: orcamento.id });
    setPagamentos(pags || []);
  }

  const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
  const faltando = orcamento ? Number(orcamento.valor_total || 0) - totalPago : 0;
  const completo = faltando <= 0.004;

  async function adicionarPagamento() {
    const valor = parseFloat(valorPagamento);
    if (!valor || valor <= 0 || !dataPagamento || !orcamento) return;
    if (valor > faltando + 0.004) {
      setErro(`O valor não pode ser maior que o restante do pedido (${fmtBRL(faltando)}).`);
      return;
    }
    setProcessando(true);
    setErro("");

    let anexoPath = null;
    if (arquivoAnexo) {
      const nomeArquivo = `${orcamento.id}/${Date.now()}-${arquivoAnexo.name}`;
      const { error: errUpload } = await supabase.storage.from("comprovantes").upload(nomeArquivo, arquivoAnexo);
      if (errUpload) {
        setProcessando(false);
        setErro("Falha ao subir o anexo: " + errUpload.message);
        return;
      }
      anexoPath = nomeArquivo;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("pagamentos_orcamento").insert({
      orcamento_id: orcamento.id,
      forma_pagamento: formaPagamento,
      valor,
      data_pagamento: dataPagamento,
      anexo_url: anexoPath,
      registrado_por: user.id
    });

    if (error) {
      setProcessando(false);
      setErro("Falha ao registrar pagamento: " + error.message);
      return;
    }

    const { data: pagsAtuais } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", orcamento.id);
    const totalPagoAgora = (pagsAtuais || []).reduce((s, p) => s + Number(p.valor), 0);
    if (totalPagoAgora >= Number(orcamento.valor_total) - 0.01 && orcamento.sem_pagamento) {
      await supabase.from("orcamentos").update({ sem_pagamento: false }).eq("id", orcamento.id);
    }

    setArquivoAnexo(null);
    setProcessando(false);
    setPagamentoConfirmado({ forma: formaPagamento, valor, data: dataPagamento });
    recarregarPedido();
  }

  function novoLancamento() {
    setPagamentoConfirmado(null);
    setFormaPagamento(FORMAS_PAGAMENTO[0]);
    setValorPagamento("");
    setDataPagamento(hoje());
    setArquivoAnexo(null);
  }

  async function excluirPagamento(pagamentoId) {
    setProcessando(true);
    await supabase.from("pagamentos_orcamento").delete().eq("id", pagamentoId);
    setProcessando(false);
    recarregarPedido();
  }

  function iniciarEdicaoPagamento(p) {
    setEditandoPagamento(p.id);
    setEdicaoPagamento({ forma_pagamento: p.forma_pagamento, valor: String(p.valor), data_pagamento: p.data_pagamento });
  }

  async function salvarEdicaoPagamento(pagamentoId) {
    const valor = parseFloat(edicaoPagamento.valor);
    if (!valor || valor <= 0 || !edicaoPagamento.data_pagamento) return;
    setProcessando(true);
    await supabase
      .from("pagamentos_orcamento")
      .update({ forma_pagamento: edicaoPagamento.forma_pagamento, valor, data_pagamento: edicaoPagamento.data_pagamento })
      .eq("id", pagamentoId);
    setProcessando(false);
    setEditandoPagamento(null);
    recarregarPedido();
  }

  async function verComprovante(anexoUrl) {
    if (!anexoUrl) return;
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(anexoUrl, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  if (perfil === undefined) {
    return <AppShell titulo="Pagamentos"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Vendedor", "Estoque"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Pagamentos">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Você não tem permissão para ver esta página.</p>
        </div>
      </AppShell>
    );
  }

  const cor = orcamento ? (CORES_STATUS[orcamento.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" }) : null;
  const IconeStatus = orcamento ? ICONES_STATUS[orcamento.status] : null;

  return (
    <AppShell titulo="Pagamentos">
      <form onSubmit={buscarPedido} className="card p-4 mb-4">
        <p className="text-xs font-medium mb-2">Buscar pedido pelo número</p>
        <div className="flex gap-2 max-w-sm">
          <input
            className="field-input"
            placeholder="Ex: 13"
            value={numeroBusca}
            onChange={(e) => setNumeroBusca(e.target.value)}
            inputMode="numeric"
          />
          <button className="btn-primary shrink-0" type="submit" disabled={buscando || !numeroBusca}>
            <Search size={15} />
            Buscar
          </button>
        </div>
        {naoEncontrado && <p className="text-sm text-danger mt-3">Nenhum pedido encontrado com o número #{numeroBusca}.</p>}
        {outraUnidade && <p className="text-sm text-danger mt-3">O pedido #{numeroBusca} pertence a outra unidade. Troque de unidade pra acessá-lo.</p>}
      </form>

      {orcamento && (
        <>
          <div className="card p-6 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-display font-semibold text-lg">Pedido #{orcamento.numero_unidade} — {orcamento.clientes?.nome}</p>
                <p className="text-sm text-muted">{orcamento.clientes?.celular || orcamento.clientes?.email || ""}</p>
              </div>
              <span className="text-xs font-mono font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
                {IconeStatus && <IconeStatus size={13} />}
                {orcamento.status}
              </span>
            </div>
          </div>

          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <div>
                <p className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
                  <Receipt size={16} style={{ color: "var(--accent)" }} />
                  Pagamento
                </p>
                <p className="text-xs text-muted">
                  Valor do pedido: <b className="font-mono text-ink">{fmtBRL(orcamento.valor_total)}</b>
                  {" · "}Total pago: <b className="font-mono text-ink">{fmtBRL(totalPago)}</b>
                  {" · "}
                  {completo ? (
                    <span className="font-semibold" style={{ color: "#2C7C6E" }}>Completo ✓</span>
                  ) : (
                    <span className="font-semibold text-danger">Faltam {fmtBRL(faltando)}</span>
                  )}
                </p>
              </div>
            </div>

            {pagamentos.length > 0 && (
              <div className="mb-4 border border-line rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                      <th className="text-left px-3 py-2">Forma</th>
                      <th className="text-left px-3 py-2">Data</th>
                      <th className="text-right px-3 py-2">Valor</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagamentos.map((p) => {
                      const emEdicao = editandoPagamento === p.id;
                      return (
                        <tr key={p.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">
                            {emEdicao ? (
                              <select className="field-input py-1 text-xs" value={edicaoPagamento.forma_pagamento} onChange={(e) => setEdicaoPagamento((a) => ({ ...a, forma_pagamento: e.target.value }))}>
                                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                              </select>
                            ) : (
                              p.forma_pagamento
                            )}
                          </td>
                          <td className="px-3 py-2 text-muted">
                            {emEdicao ? (
                              <input type="date" className="field-input py-1 text-xs" value={edicaoPagamento.data_pagamento} onChange={(e) => setEdicaoPagamento((a) => ({ ...a, data_pagamento: e.target.value }))} />
                            ) : (
                              new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-mono">
                            {emEdicao ? (
                              <input type="number" step="0.01" className="field-input py-1 text-xs text-right w-24 ml-auto" value={edicaoPagamento.valor} onChange={(e) => setEdicaoPagamento((a) => ({ ...a, valor: e.target.value }))} />
                            ) : (
                              fmtBRL(p.valor)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {emEdicao ? (
                                <button onClick={() => salvarEdicaoPagamento(p.id)} className="text-muted hover:text-ink" title="Salvar">
                                  <Save size={13} />
                                </button>
                              ) : (
                                <button onClick={() => iniciarEdicaoPagamento(p)} className="text-muted hover:text-ink" title="Editar">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {p.anexo_url && (
                                <button onClick={() => verComprovante(p.anexo_url)} className="text-muted hover:text-ink" title="Ver comprovante">
                                  <ExternalLink size={13} />
                                </button>
                              )}
                              <button onClick={() => excluirPagamento(p.id)} className="text-muted hover:text-danger" title="Excluir">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs font-semibold mb-2">{pagamentos.length > 0 ? "Adicionar mais uma forma de pagamento" : "Registrar pagamento"}</p>
            {pagamentoConfirmado ? (
              <div className="rounded-lg px-4 py-3.5 flex items-center justify-between gap-3" style={{ background: "rgba(63,167,150,0.12)", color: "#2C7C6E" }}>
                <div className="flex items-center gap-2 text-sm">
                  <Check size={16} className="shrink-0" />
                  <span>
                    Pagamento confirmado: <b>{pagamentoConfirmado.forma}</b> — {fmtBRL(pagamentoConfirmado.valor)} em {new Date(pagamentoConfirmado.data + "T00:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <button className="btn-secondary text-xs py-1.5 px-3 shrink-0" onClick={novoLancamento}>
                  <RefreshCw size={13} />
                  Novo lançamento
                </button>
              </div>
            ) : faltando <= 0.004 ? (
              <div className="rounded-lg px-4 py-3.5 text-sm flex items-center gap-2" style={{ background: "rgba(63,167,150,0.12)", color: "#2C7C6E" }}>
                <Check size={16} className="shrink-0" />
                Pedido totalmente pago — não é preciso registrar mais nada.
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="field-label">Forma de pagamento</label>
                    <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                      {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Valor</label>
                    <input type="number" step="0.01" max={faltando > 0 ? faltando.toFixed(2) : undefined} className="field-input" value={valorPagamento} onChange={(e) => setValorPagamento(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Data</label>
                    <input type="date" className="field-input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Anexo (opcional)</label>
                    <label className="flex items-center gap-2 border border-line rounded-[10px] px-3.5 py-2.5 cursor-pointer text-sm text-muted hover:border-brand-400 truncate">
                      <Paperclip size={14} className="shrink-0" />
                      <span className="truncate">{arquivoAnexo ? arquivoAnexo.name : "Escolher"}</span>
                      <input type="file" className="hidden" onChange={(e) => setArquivoAnexo(e.target.files[0] || null)} />
                    </label>
                  </div>
                </div>
                <button className="btn-primary mt-4" disabled={processando || !valorPagamento || !dataPagamento} onClick={adicionarPagamento}>
                  <Plus size={15} />
                  {processando ? "Salvando..." : "Confirmar lançamento"}
                </button>
              </>
            )}
          </div>

          {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
        </>
      )}
    </AppShell>
  );
}
