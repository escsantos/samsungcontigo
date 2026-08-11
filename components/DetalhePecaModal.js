"use client";
import { useEffect, useState } from "react";
import { Copy, Check, Send } from "lucide-react";
import Modal from "./Modal";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DetalhePecaModal({ peca, qtd, mostraCusto, onClose }) {
  const [copiado, setCopiado] = useState(false);
  const [modoCliente, setModoCliente] = useState(false);

  useEffect(() => {
    setModoCliente(false);
    setCopiado(false);
  }, [peca?.id]);

  if (!peca) return null;

  const mostrarCustoAgora = mostraCusto && !modoCliente;

  function linhasTexto() {
    const linhas = [
      `Modelo: ${peca.modelo}`,
      `Categoria: ${peca.categoria}`,
      `Código: ${peca.codigo}`,
      `Descrição: ${peca.descricao_resumida}`,
      `Peça: ${peca.descricao_peca}`,
      `Qtd: ${qtd}`
    ];
    if (mostrarCustoAgora) {
      linhas.push(`Custo: ${fmtBRL(peca.custoTotal)}`);
      linhas.push(`Imposto: ${fmtBRL(peca.impostoTotal)}`);
      linhas.push(`Lucro Líquido: ${fmtBRL(peca.lucroLiquidoTotal)}`);
    }
    linhas.push(`Valor de Venda: ${fmtBRL(peca.vendaTotal)}`);
    return linhas;
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(linhasTexto().join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      // ignora silenciosamente se o navegador bloquear
    }
  }

  return (
    <Modal
      open={!!peca}
      onClose={onClose}
      title="Detalhes da peça"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
          <button className="btn-primary" onClick={copiar}>
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? "Copiado!" : "Copiar para WhatsApp"}
          </button>
        </>
      }
    >
      {mostraCusto && (
        <button
          onClick={() => setModoCliente((v) => !v)}
          className="w-full flex items-center gap-3 mb-4 p-3 rounded-lg border transition"
          style={{
            borderColor: modoCliente ? "var(--accent)" : "var(--line)",
            background: modoCliente ? "var(--accent-soft)" : "transparent"
          }}
        >
          <span
            className="w-10 h-5.5 rounded-full shrink-0 relative transition"
            style={{ background: modoCliente ? "var(--accent)" : "var(--line)", height: 22, width: 40 }}
          >
            <span
              className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all"
              style={{ left: modoCliente ? 19 : 3 }}
            />
          </span>
          <span className="text-left flex-1">
            <span className="flex items-center gap-1.5 text-xs font-medium text-ink">
              <Send size={12} />
              Enviar para Cliente
            </span>
            <span className="block text-[10.5px] text-muted mt-0.5">
              {modoCliente ? "Oculta custo, imposto e lucro — só mostra o valor de venda" : "Mostra todos os valores internos"}
            </span>
          </span>
        </button>
      )}

      <div className="bg-canvas rounded-lg p-4 text-sm space-y-1.5 font-mono">
        {linhasTexto().map((l, i) => <p key={i}>{l}</p>)}
      </div>

      {mostrarCustoAgora && peca.data_referencia && (
        <p className="text-[11px] text-muted mt-2 text-left">
          Valor atualizado em: <span className="font-mono">{peca.data_referencia}</span>
        </p>
      )}
    </Modal>
  );
}
