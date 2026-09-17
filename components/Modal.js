"use client";
import { X } from "lucide-react";

const LARGURAS = {
  md: "w-full max-w-lg",
  lg: "w-full max-w-3xl",
  xl: "w-[96vw] max-w-[1400px]"
};

export default function Modal({ open, onClose, title, children, footer, tamanho = "md" }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`card relative ${LARGURAS[tamanho] || LARGURAS.md} p-6 shadow-2xl max-h-[88vh] overflow-auto`}>
        <button
          onClick={onClose}
          aria-label="Fechar"
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-canvas transition"
        >
          <X size={18} />
        </button>
        {title && <p className="font-display font-semibold text-[16px] mb-4 pr-8">{title}</p>}
        {children}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}
