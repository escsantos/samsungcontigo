"use client";
import { useEffect, useState } from "react";
import { Paperclip, FileText, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import Modal from "./Modal";
import { supabase } from "../lib/supabaseClient";
import { registrarAuditoria } from "../lib/auditoria";
import { FORMAS_PAGAMENTO_COMISSAO } from "../lib/relatorios";

// Pop-up de pagamento da comissão do mês de um vendedor (13/10/2026).
// Mostra a comissão calculada, o que já foi pago no mês (com comprovante)
// e, pra quem pode pagar, o formulário pra registrar o pagamento — o valor
// já vem preenchido com o que falta pagar.

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDataISO(d) {
  if (!d) return "—";
  const [a, m, dia] = String(d).slice(0, 10).split("-");
  return `${dia}/${m}/${a}`;
}
function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PagamentoComissaoModal({
  open, onClose, onSalvo,
  vendedorId, vendedorNome, competencia, rotuloMes, unidadeId,
  comissaoMes, pagamentos, podePagar
}) {
  const totalPago = (pagamentos || []).reduce((s, p) => s + Number(p.valor || 0), 0);
  const falta = Math.max(0, Number(comissaoMes || 0) - totalPago);
  const quitado = comissaoMes > 0 && falta <= 0.004;

  const [valor, setValor] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [forma, setForma] = useState(FORMAS_PAGAMENTO_COMISSAO[0]);
  const [observacao, setObservacao] = useState("");
  const [arquivo, setArquivo] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [confirmandoId, setConfirmandoId] = useState(null);

  useEffect(() => {
    if (!open) return;
    setValor(falta > 0.004 ? falta.toFixed(2) : "");
    setDataPagamento(hojeISO());
    setForma(FORMAS_PAGAMENTO_COMISSAO[0]);
    setObservacao("");
    setArquivo(null);
    setErro("");
    setConfirmandoId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vendedorId, competencia]);

  async function salvar() {
    const v = parseFloat(String(valor).replace(",", "."));
    if (!v || v <= 0) { setErro("Informe o valor pago."); return; }
    if (!dataPagamento) { setErro("Informe a data do pagamento."); return; }
    if (!arquivo) { setErro("Anexe o comprovante de pagamento ou o recibo assinado."); return; }
    setProcessando(true);
    setErro("");

    const nomeLimpo = arquivo.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
    const caminho = `comissoes/${vendedorId}/${competencia}-${Date.now()}-${nomeLimpo}`;
    const { error: errUpload } = await supabase.storage.from("comprovantes").upload(caminho, arquivo);
    if (errUpload) {
      setProcessando(false);
      setErro("Falha ao subir o anexo: " + errUpload.message);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const registro = {
      unidade_id: unidadeId,
      vendedor_id: vendedorId,
      competencia,
      valor: Number(v.toFixed(2)),
      forma_pagamento: forma,
      data_pagamento: dataPagamento,
      observacao: observacao.trim() || null,
      anexo_path: caminho,
      registrado_por: user?.id || null
    };
    const { data: inserido, error } = await supabase.from("comissoes_pagamentos").insert(registro).select("id").single();
    if (error) {
      setProcessando(false);
      setErro("Falha ao registrar o pagamento: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "pagamento",
      entidade: "comissoes",
      entidadeId: inserido?.id,
      descricao: `Comissão de ${vendedorNome} (${rotuloMes}) marcada como paga: ${forma} — ${fmtBRL(v)}.`,
      dadosDepois: registro
    });
    setProcessando(false);
    onSalvo && onSalvo();
  }

  async function desfazer(p) {
    if (!podePagar) return;
    // Sem confirm() do navegador: pede um clique de confirmação no próprio botão.
    if (confirmandoId !== p.id) { setConfirmandoId(p.id); setErro(`Clique de novo na lixeira para desfazer o pagamento de ${fmtBRL(p.valor)}.`); return; }
    setConfirmandoId(null);
    setProcessando(true);
    const { error } = await supabase.from("comissoes_pagamentos").delete().eq("id", p.id);
    if (error) {
      setProcessando(false);
      setErro("Falha ao desfazer: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "exclusao",
      entidade: "comissoes",
      entidadeId: p.id,
      descricao: `Pagamento de comissão desfeito: ${vendedorNome} (${rotuloMes}) — ${p.forma_pagamento} ${fmtBRL(p.valor)}.`,
      dadosAntes: p
    });
    setProcessando(false);
    setErro("");
    onSalvo && onSalvo();
  }

  async function abrirAnexo(caminho) {
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(caminho, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
    else setErro("Não foi possível abrir o anexo.");
  }

  return (
    <Modal open={open} onClose={onClose} title={`Comissão — ${vendedorNome || ""}`} tamanho="md">
      <p className="text-sm text-muted -mt-2 mb-4">Competência: <b>{rotuloMes}</b></p>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg border border-line p-3">
          <p className="text-[11px] text-muted">Comissão do mês</p>
          <p className="font-mono font-semibold" style={{ color: "#C2801F" }}>{fmtBRL(comissaoMes)}</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <p className="text-[11px] text-muted">Já pago</p>
          <p className="font-mono font-semibold" style={{ color: "var(--success)" }}>{fmtBRL(totalPago)}</p>
        </div>
        <div className="rounded-lg border border-line p-3">
          <p className="text-[11px] text-muted">A pagar</p>
          <p className="font-mono font-semibold" style={{ color: falta > 0.004 ? "var(--danger)" : "var(--success)" }}>{fmtBRL(falta)}</p>
        </div>
      </div>

      {quitado && (
        <p className="text-sm mb-4 flex items-center gap-2" style={{ color: "var(--success)" }}>
          <CheckCircle2 size={16} /> Comissão do mês quitada.
        </p>
      )}
      {totalPago > 0 && falta > 0.004 && (
        <p className="text-sm mb-4 flex items-start gap-2" style={{ color: "var(--danger)" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          Entraram pedidos depois do último pagamento: falta pagar a diferença de {fmtBRL(falta)}.
        </p>
      )}

      {(pagamentos || []).length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-medium mb-2">Pagamentos registrados</p>
          <div className="space-y-2">
            {pagamentos.map((p) => (
              <div key={p.id} className="rounded-lg border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-semibold">{fmtBRL(p.valor)}</span>
                  <span className="text-xs text-muted">{fmtDataISO(p.data_pagamento)} · {p.forma_pagamento}</span>
                </div>
                {p.observacao && <p className="text-xs text-muted mt-1 whitespace-pre-wrap">{p.observacao}</p>}
                <div className="flex items-center justify-between mt-2">
                  <button type="button" className="text-xs flex items-center gap-1.5 hover:underline" style={{ color: "var(--accent)" }} onClick={() => abrirAnexo(p.anexo_path)}>
                    <FileText size={13} /> Ver comprovante / recibo
                  </button>
                  <span className="text-[11px] text-muted">
                    {p.registrador?.nome ? `por ${p.registrador.nome}` : ""}
                    {podePagar && (
                      <button type="button" disabled={processando} onClick={() => desfazer(p)} className={`ml-2 align-middle hover:text-danger ${confirmandoId === p.id ? "text-danger" : "text-muted"}`} title="Desfazer este pagamento">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {podePagar && falta > 0.004 && (
        <div className="border-t border-line pt-4">
          <p className="text-xs font-medium mb-3">{totalPago > 0 ? "Pagar diferença" : "Marcar como pago"}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Valor *</label>
              <input type="number" step="0.01" min="0.01" className="field-input" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Data do pagamento *</label>
              <input type="date" className="field-input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="field-label">Forma de pagamento *</label>
              <select className="field-input" value={forma} onChange={(e) => setForma(e.target.value)}>
                {FORMAS_PAGAMENTO_COMISSAO.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="field-label">Observação</label>
              <textarea className="field-input" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="col-span-2">
              <label className="field-label">Comprovante ou recibo assinado *</label>
              <label className={`flex items-center gap-2 border rounded-[10px] px-3.5 py-2.5 cursor-pointer text-sm truncate ${arquivo ? "border-line text-muted hover:border-brand-400" : "border-danger text-danger"}`}>
                <Paperclip size={14} className="shrink-0" />
                <span className="truncate">{arquivo ? arquivo.name : "Escolher arquivo (obrigatório)"}</span>
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setArquivo(e.target.files[0] || null)} />
              </label>
            </div>
          </div>
        </div>
      )}

      {!podePagar && falta > 0.004 && (
        <p className="text-sm text-muted">Pagamento ainda não registrado.</p>
      )}

      {erro && <p className="text-sm text-danger mt-3">{erro}</p>}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
        {podePagar && falta > 0.004 && (
          <button type="button" className="btn-primary" disabled={processando} onClick={salvar}>
            {processando ? "Salvando..." : "Confirmar pagamento"}
          </button>
        )}
      </div>
    </Modal>
  );
}
