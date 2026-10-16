"use client";
import { BadgeCheck } from "lucide-react";

// Selo de confirmação (16/10/2026) — "carimbo" com quem confirmou, login,
// data/hora da confirmação e data do pagamento. Usado no Pagamento ao
// Fabricante (prévia no pop-up) e no histórico de pagamentos confirmados.
export default function SeloConfirmacao({ titulo = "PAGO AO FABRICANTE", nome, login, confirmadoEm, dataPagamento, previa = false }) {
  const quando = confirmadoEm ? new Date(confirmadoEm) : null;
  return (
    <div
      className="inline-flex items-center gap-3 rounded-xl px-4 py-3 select-none"
      style={{
        border: "2px dashed #2C7C6E",
        background: "rgba(63,167,150,0.08)",
        color: "#2C7C6E",
        transform: previa ? "none" : "rotate(-1.5deg)"
      }}
    >
      <BadgeCheck size={34} className="shrink-0" />
      <div className="leading-tight">
        <p className="font-mono font-black tracking-widest text-[12px]">{titulo}</p>
        {dataPagamento && (
          <p className="text-[11px]">Pagamento em <b>{new Date(dataPagamento + "T00:00:00").toLocaleDateString("pt-BR")}</b></p>
        )}
        <p className="text-[11px]">Confirmado por <b>{nome || "—"}</b>{login ? <> (<span className="font-mono">{login}</span>)</> : null}</p>
        <p className="text-[11px] font-mono">{quando ? `${quando.toLocaleDateString("pt-BR")} às ${quando.toLocaleTimeString("pt-BR")}` : "—"}{previa ? " (ao confirmar)" : ""}</p>
      </div>
    </div>
  );
}
