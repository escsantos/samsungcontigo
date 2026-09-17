"use client";
import { X } from "lucide-react";
import { useEffect } from "react";

export default function Modal({ titulo, subtitulo, onFechar, children, largura = "max-w-2xl" }) {
  useEffect(() => {
    function aoTeclar(e) {
      if (e.key === "Escape") onFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onFechar}>
      <div
        className={`card w-full ${largura} max-h-[85vh] overflow-hidden flex flex-col shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-5 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="font-display text-lg font-semibold text-ink">{titulo}</h2>
            {subtitulo && <p className="text-sm text-muted mt-0.5">{subtitulo}</p>}
          </div>
          <button
            onClick={onFechar}
            className="rounded-full p-1.5 text-muted hover:bg-canvas hover:text-ink transition"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
