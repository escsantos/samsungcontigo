"use client";
import { useState } from "react";
import { Camera } from "lucide-react";

export default function BotaoCaptura() {
  const [capturando, setCapturando] = useState(false);

  async function capturar() {
    setCapturando(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, { backgroundColor: null, scale: 2 });
      const link = document.createElement("a");
      link.download = `caixa-jmacedo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      alert("Não foi possível capturar a tela: " + err.message);
    } finally {
      setCapturando(false);
    }
  }

  return (
    <button
      onClick={capturar}
      disabled={capturando}
      title="Capturar tela"
      className="fixed bottom-8 left-8 w-11 h-11 rounded-full bg-white border border-line shadow-lg
                 flex items-center justify-center text-muted hover:text-gold hover:border-gold/50 transition disabled:opacity-60 z-40"
    >
      <Camera size={18} />
    </button>
  );
}
