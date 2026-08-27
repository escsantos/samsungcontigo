"use client";
import { Info } from "lucide-react";

// Card de estatística usado nos relatórios (Resumo, Dashboard Financeiro...).
// icone: componente de ícone (lucide-react). cor: cor de destaque (hex).
// tooltip: texto opcional que aparece num balão ao passar o mouse no ícone "i".
// destaque: dá um contorno colorido no card, pra chamar mais atenção.
export default function CardStat({ icone: Icone, cor, label, valor, corValor, tooltip, destaque }) {
  return (
    <div
      className="card p-4 relative"
      style={destaque ? { borderColor: cor, boxShadow: `0 0 0 1.5px ${cor}` } : undefined}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cor}1F`, color: cor }}>
          <Icone size={15} />
        </div>
        <p className="text-xs text-muted flex items-center gap-1 leading-tight">
          {label}
          {tooltip && (
            <span className="group relative inline-flex items-center">
              <Info size={12} className="cursor-help" />
              <span className="pointer-events-none absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-56 rounded-lg text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg" style={{ background: "#1F2430" }}>
                {tooltip}
              </span>
            </span>
          )}
        </p>
      </div>
      <p className="font-mono font-bold text-lg" style={corValor ? { color: corValor } : undefined}>{valor}</p>
    </div>
  );
}
