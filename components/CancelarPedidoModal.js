"use client";
import { useState } from "react";
import { XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { registrarAuditoria } from "../lib/auditoria";
import Modal from "./Modal";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CancelarPedidoModal({ open, onClose, orcamento, totalPago, onCancelado }) {
  const [motivo, setMotivo] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  const temValorRecebido = totalPago > 0.004;

  async function confirmarCancelamento() {
    setProcessando(true);
    setErro("");
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: errUpdate } = await supabase
        .from("orcamentos")
        .update({
          status: "Cancelado",
          motivo_cancelamento: motivo.trim() || null,
          cancelado_por: user.id,
          cancelado_em: new Date().toISOString()
        })
        .eq("id", orcamento.id);
      if (errUpdate) throw new Error(errUpdate.message);

      if (temValorRecebido) {
        const { error: errEstorno } = await supabase.from("estornos").insert({
          orcamento_id: orcamento.id,
          unidade_id: orcamento.unidade_id,
          valor: totalPago,
          motivo: motivo.trim() || null,
          solicitado_por: user.id
        });
        if (errEstorno) throw new Error("Pedido cancelado, mas falhou ao abrir a solicitação de estorno: " + errEstorno.message);
      }

      await registrarAuditoria({
        tipoEvento: "status",
        entidade: "orcamentos",
        entidadeId: orcamento.id,
        descricao: `Orçamento #${orcamento.numero_unidade} cancelado.${temValorRecebido ? ` Estorno de ${fmtBRL(totalPago)} solicitado ao Financeiro.` : ""}${motivo.trim() ? " Motivo: " + motivo.trim() : ""}`,
        unidadeId: orcamento.unidade_id
      });

      setMotivo("");
      onCancelado?.();
      onClose();
    } catch (e) {
      setErro(e.message);
    }
    setProcessando(false);
  }

  return (
    <Modal
      open={open}
      onClose={() => !processando && onClose()}
      title="Cancelar pedido"
      footer={
        <>
          <button className="btn-secondary" disabled={processando} onClick={onClose}>Voltar</button>
          <button className="btn-primary" style={{ background: "var(--danger)" }} disabled={processando} onClick={confirmarCancelamento}>
            <XCircle size={15} />
            {processando ? "Cancelando..." : "Confirmar cancelamento"}
          </button>
        </>
      }
    >
      <div className="rounded-lg px-3 py-2.5 text-sm mb-4 flex items-start gap-2" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        {temValorRecebido ? (
          <span>
            Esse pedido tem <b>{fmtBRL(totalPago)}</b> já recebido. Ao cancelar, vai ser aberta uma <b>solicitação de estorno</b> pro
            Financeiro processar a devolução. O pedido fica marcado como Cancelado imediatamente.
          </span>
        ) : (
          <span>Esse pedido ainda não tem nenhum valor recebido — o cancelamento encerra ele direto, sem necessidade de estorno.</span>
        )}
      </div>
      <label className="field-label">Motivo (opcional)</label>
      <textarea
        className="field-input"
        rows={3}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Ex: cliente desistiu da compra"
      />
      {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
    </Modal>
  );
}
