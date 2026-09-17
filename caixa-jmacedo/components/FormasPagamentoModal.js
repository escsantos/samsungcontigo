"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, CreditCard } from "lucide-react";
import Modal from "./Modal";
import CurrencyInput from "./CurrencyInput";
import { FORMAS_PAGAMENTO, BANDEIRAS, precisaParcelas, precisaBandeira } from "../lib/formasPagamento";

let proximoId = 1;
function novaLinha() {
  return { id: proximoId++, valor: "", forma: "", parcelas: "", bandeira: "" };
}

/**
 * Pop-up para lançar mais de uma forma de pagamento no mesmo lançamento.
 *
 *   <FormasPagamentoModal
 *     aberto={mostrarModalFormas}
 *     formasIniciais={formasPagamento}   // [] ou o array já salvo, para reabrir editando
 *     onFechar={() => setMostrarModalFormas(false)}
 *     onSalvar={(formas) => { ... }}
 *   />
 */
export default function FormasPagamentoModal({ aberto, formasIniciais, onFechar, onSalvar }) {
  const [linhas, setLinhas] = useState([]);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!aberto) return;
    if (formasIniciais && formasIniciais.length > 0) {
      setLinhas(formasIniciais.map((f) => ({ id: proximoId++, valor: f.valor, forma: f.forma_pagamento, parcelas: f.parcelas || "", bandeira: f.bandeira || "" })));
    } else {
      setLinhas([novaLinha(), novaLinha()]);
    }
    setErro(null);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!aberto) return null;

  function atualizarLinha(id, campo, valor) {
    setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, [campo]: valor } : l)));
  }

  function adicionarLinha() {
    setLinhas((ls) => [...ls, novaLinha()]);
  }

  function removerLinha(id) {
    setLinhas((ls) => ls.filter((l) => l.id !== id));
  }

  const total = linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0);

  function salvar() {
    if (linhas.length === 0) {
      setErro("Adicione pelo menos uma forma de pagamento.");
      return;
    }
    for (const l of linhas) {
      if (!l.valor || Number(l.valor) <= 0) {
        setErro("Preencha o valor de todas as formas de pagamento.");
        return;
      }
      if (!l.forma) {
        setErro("Selecione a forma de pagamento em todas as linhas.");
        return;
      }
    }
    setErro(null);
    onSalvar(
      linhas.map((l) => ({
        valor: Number(l.valor),
        forma_pagamento: l.forma,
        parcelas: precisaParcelas(l.forma) && l.parcelas ? Number(l.parcelas) : null,
        bandeira: precisaBandeira(l.forma) ? l.bandeira || null : null,
      }))
    );
  }

  return (
    <Modal titulo="Mais de uma forma de pagamento" subtitulo="Informe o valor e a forma de cada pagamento recebido nesta OS." onFechar={onFechar} largura="max-w-xl">
      <div className="space-y-3">
        {linhas.map((l, i) => (
          <div key={l.id} className="rounded-lg border border-line p-3">
            <div className="flex items-start gap-2">
              <div className="w-32 shrink-0">
                <label className="field-label">Valor</label>
                <CurrencyInput valor={l.valor} onChange={(v) => atualizarLinha(l.id, "valor", v)} />
              </div>
              <div className="flex-1">
                <label className="field-label">Forma de pagamento</label>
                <select className="field-input" value={l.forma} onChange={(e) => atualizarLinha(l.id, "forma", e.target.value)}>
                  <option value="">Selecione</option>
                  {FORMAS_PAGAMENTO.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => removerLinha(l.id)}
                title="Remover esta forma de pagamento"
                className="mt-6 text-muted hover:text-danger transition p-1.5 shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {(precisaParcelas(l.forma) || precisaBandeira(l.forma)) && (
              <div className="flex items-end gap-2 mt-2 pl-0">
                {precisaParcelas(l.forma) && (
                  <div className="w-24 shrink-0">
                    <label className="field-label">Parcelas</label>
                    <select className="field-input" value={l.parcelas} onChange={(e) => atualizarLinha(l.id, "parcelas", e.target.value)}>
                      <option value="">1x</option>
                      {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <option key={n} value={n}>{n}x</option>
                      ))}
                    </select>
                  </div>
                )}
                {precisaBandeira(l.forma) && (
                  <div className="flex-1">
                    <label className="field-label">Bandeira</label>
                    <div className="flex gap-1.5 flex-wrap">
                      {BANDEIRAS.map((b) => (
                        <button
                          type="button"
                          key={b}
                          onClick={() => atualizarLinha(l.id, "bandeira", b)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                            l.bandeira === b ? "border-gold bg-gold-soft/60 text-gold-strong font-medium" : "border-line bg-white text-muted hover:border-gold/50"
                          }`}
                        >
                          <CreditCard size={12} /> {b}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button type="button" onClick={adicionarLinha} className="btn text-sm flex items-center gap-1.5 w-full justify-center">
          <Plus size={14} /> Adicionar outra forma de pagamento
        </button>

        {erro && <p className="text-sm text-danger">{erro}</p>}

        <div className="flex items-center justify-between pt-2 border-t border-line">
          <p className="text-sm text-muted">
            Total: <span className="font-mono-num font-semibold text-ink">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" className="btn text-sm" onClick={onFechar}>Cancelar</button>
            <button type="button" className="btn-primary text-sm" onClick={salvar}>Salvar</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
