"use client";
import { Info } from "lucide-react";

// Card de estatística usado nos relatórios (Resumo, Dashboard Financeiro...).
// icone: componente de ícone (lucide-react). cor: cor de destaque (hex).
// tooltip: texto opcional que aparece num balão ao passar o mouse no ícone "i".
// destaque: dá um contorno colorido no card, pra chamar mais atenção.
// compacto: versão menor (padding/ícone/fonte reduzidos), pra caber mais cards numa linha só.
export default function CardStat({ icone: Icone, cor, label, valor, corValor, tooltip, destaque, compacto }) {
  return (
    <div
      className={compacto ? "card p-2.5 relative" : "card p-4 relative"}
      style={destaque ? { borderColor: cor, boxShadow: `0 0 0 ${compacto ? 1 : 1.5}px ${cor}` } : undefined}
    >
      <div className={compacto ? "flex items-center gap-1.5 mb-1" : "flex items-center gap-2 mb-1.5"}>
        <div
          className={compacto ? "w-5 h-5 rounded-md flex items-center justify-center shrink-0" : "w-7 h-7 rounded-lg flex items-center justify-center shrink-0"}
          style={{ background: `${cor}1F`, color: cor }}
        >
          <Icone size={compacto ? 11 : 15} />
        </div>
        <p className={compacto ? "text-[10px] text-muted flex items-center gap-1 leading-tight truncate" : "text-xs text-muted flex items-center gap-1 leading-tight"}>
          {label}
          {tooltip && (
            <span className="group relative inline-flex items-center shrink-0">
              <Info size={compacto ? 10 : 12} className="cursor-help" />
              <span className="pointer-events-none absolute z-10 left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block w-52 rounded-lg text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg" style={{ background: "#1F2430" }}>
                {tooltip}
              </span>
            </span>
          )}
        </p>
      </div>
      <p className={compacto ? "font-mono font-bold text-sm truncate" : "font-mono font-bold text-lg"} style={corValor ? { color: corValor } : undefined}>{valor}</p>
    </div>
  );
}
