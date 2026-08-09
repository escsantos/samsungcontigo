"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import Modal from "./Modal";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function DetalhePecaModal({ peca, qtd, mostraCusto, onClose }) {
  const [copiado, setCopiado] = useState(false);
  if (!peca) return null;

  function linhasTexto() {
    const linhas = [
      `Modelo: ${peca.modelo}`,
      `Categoria: ${peca.categoria}`,
      `Código: ${peca.codigo}`,
      `Descrição: ${peca.descricao_resumida}`,
      `Peça: ${peca.descricao_peca}`,
      `Qtd: ${qtd}`
    ];
    if (mostraCusto) {
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
      <div className="bg-canvas rounded-lg p-4 text-sm space-y-1.5 font-mono">
        {linhasTexto().map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </Modal>
  );
}
