"use client";
import { useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

/** Só o Administrador vê este botão — manda um aviso em balão pra quem estiver online agora. */
export default function BotaoAvisoAdmin() {
  const { usuario } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  if (usuario.cargo !== "administrador") return null;

  async function enviar() {
    if (!texto.trim()) return;
    setEnviando(true);
    const { error } = await supabase.from("avisos_admin").insert({ texto: texto.trim(), autor_id: usuario.id });
    setEnviando(false);
    if (error) {
      alert("Não foi possível enviar: " + error.message);
      return;
    }
    setTexto("");
    setEnviado(true);
    setTimeout(() => {
      setEnviado(false);
      setAberto(false);
    }, 1200);
  }

  return (
    <>
      <button onClick={() => setAberto(true)} title="Enviar aviso para todos online" className="text-muted hover:text-gold transition">
        <Megaphone size={19} />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6" onClick={() => setAberto(false)}>
          <div className="absolute inset-0 bg-ink/20" />
          <div
            className="relative w-full max-w-sm bg-white rounded-xl2 shadow-2xl border border-line mt-14"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
              <Megaphone size={16} className="text-gold" />
              <p className="font-display text-sm font-semibold text-ink">Avisar todo mundo online</p>
            </div>
            <div className="p-4 space-y-3">
              <textarea
                className="field-input resize-none"
                rows={3}
                maxLength={500}
                placeholder="Escreva o aviso que vai aparecer em balão pra quem estiver online agora…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <p className="text-[10px] text-muted">
                Aparece só pra quem estiver com o sistema aberto no momento do envio — o balão fica até a pessoa fechar.
              </p>
              <div className="flex justify-end gap-2">
                <button className="btn text-sm" onClick={() => setAberto(false)}>Cancelar</button>
                <button
                  className="btn-primary text-sm flex items-center gap-1.5"
                  onClick={enviar}
                  disabled={!texto.trim() || enviando}
                >
                  <Send size={13} /> {enviando ? "Enviando…" : enviado ? "Enviado!" : "Enviar aviso"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
