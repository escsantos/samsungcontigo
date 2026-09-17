"use client";

const CORES = {
  gold: "from-gold to-gold-strong shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(184,134,46,0.55)]",
  teal: "from-teal to-[#0A4440] shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(14,90,86,0.55)]",
  ink: "from-ink-600 to-ink-800 shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(20,24,31,0.45)]",
};

/**
 * Botão flutuante 3D, mesmo estilo do BotaoAtualizar, para outras ações
 * (exportar, imprimir, etc). Uso:
 *
 *   <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportar} cor="teal" />
 */
export default function BotaoAcao3D({ icone: Icone, rotulo, onClick, cor = "gold", disabled = false, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white
        bg-gradient-to-b ${CORES[cor] || CORES.gold}
        hover:brightness-105 hover:-translate-y-0.5
        active:translate-y-0
        transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      <Icone size={15} />
      {rotulo}
    </button>
  );
}
