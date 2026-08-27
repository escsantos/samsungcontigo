"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Botão "Atualizar" flutuante, com leve efeito 3D (sombra + hover/press),
 * no tom dourado do sistema. Uso:
 *
 *   <BotaoAtualizar aoAtualizar={carregar} />
 *
 * `aoAtualizar` pode ser síncrona ou async — o botão mostra o ícone
 * girando enquanto ela roda e trava novos cliques nesse meio-tempo.
 */
export default function BotaoAtualizar({ aoAtualizar, className = "" }) {
  const [girando, setGirando] = useState(false);

  async function aoClicar() {
    if (girando) return;
    setGirando(true);
    try {
      await aoAtualizar?.();
    } finally {
      // segura o giro por um instante mínimo, pra não "piscar" em buscas muito rápidas
      setTimeout(() => setGirando(false), 400);
    }
  }

  return (
    <button
      onClick={aoClicar}
      disabled={girando}
      title="Atualizar dados"
      className={`group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white
        bg-gradient-to-b from-gold to-gold-strong
        shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(184,134,46,0.55)]
        hover:brightness-105 hover:-translate-y-0.5
        active:translate-y-0 active:shadow-[0_1px_0_0_rgba(0,0,0,0.18),0_4px_8px_-2px_rgba(184,134,46,0.5)]
        transition-all duration-150 disabled:cursor-wait disabled:opacity-90 ${className}`}
    >
      <RefreshCw size={15} className={girando ? "animate-spin" : "transition-transform group-hover:rotate-45"} />
      {girando ? "Atualizando…" : "Atualizar"}
    </button>
  );
}
