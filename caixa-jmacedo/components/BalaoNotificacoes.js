"use client";
import { useEffect, useState } from "react";
import { PartyPopper, Sparkles, Megaphone, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

let proximoIdBalao = 1;
const DURACAO_BALAO_MS = 10000;

function formatarMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

/** Bipe curto de duas notas (tipo notificação do Windows), sem depender de nenhum arquivo de som. */
function tocarBip() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const tocarNota = (frequencia, inicioEm, duracao) => {
      const osc = ctx.createOscillator();
      const ganho = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequencia;
      const t0 = ctx.currentTime + inicioEm;
      ganho.gain.setValueAtTime(0.0001, t0);
      ganho.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      ganho.gain.exponentialRampToValueAtTime(0.0001, t0 + duracao);
      osc.connect(ganho);
      ganho.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duracao + 0.02);
    };
    if (ctx.state === "suspended") ctx.resume();
    tocarNota(880, 0, 0.16); // primeira nota
    tocarNota(1175, 0.14, 0.22); // segunda nota, um pouco mais aguda
  } catch {
    // navegador sem suporte a áudio — segue em silêncio, sem quebrar nada
  }
}

/**
 * Balões de notificação ao vivo (Supabase Realtime):
 *   - novo lançamento → broadcast público (todo mundo vê, independente
 *     de unidade) com só o resumo — some sozinho em 5s
 *   - aviso do administrador → balão que só fecha no clique
 */
export default function BalaoNotificacoes() {
  const { usuario } = useSessao();
  const [baloes, setBaloes] = useState([]);

  function removerBalao(id) {
    setBaloes((atual) => atual.filter((b) => b.id !== id));
  }

  function aoNovoLancamento({ payload }) {
    const id = proximoIdBalao++;
    setBaloes((atual) => [
      ...atual,
      { id, tipo: "lancamento", unidade: payload.unidade, login: payload.login, valor: Number(payload.valor) },
    ]);
    tocarBip();
    setTimeout(() => removerBalao(id), DURACAO_BALAO_MS);
  }

  function aoNovoAviso(payload) {
    const a = payload.new;
    const id = proximoIdBalao++;
    setBaloes((atual) => [...atual, { id, tipo: "aviso", texto: a.texto }]);
    tocarBip();
  }

  useEffect(() => {
    if (!usuario) return;
    const canal = supabase
      .channel("celebracoes")
      .on("broadcast", { event: "novo_lancamento" }, aoNovoLancamento)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "avisos_admin" }, aoNovoAviso)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed bottom-5 right-5 z-[200] flex flex-col-reverse gap-2.5 items-end pointer-events-none max-w-[90vw]">
      {baloes.map((b) => (
        <div key={b.id} className="balao-notificacao pointer-events-auto">
          {b.tipo === "lancamento" ? (
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl border border-white/40 text-white w-80"
              style={{
                background: "linear-gradient(135deg, #B8862E 0%, #D9A83E 45%, #0E7A72 100%)",
                boxShadow: "0 8px 24px -4px rgba(184,134,46,0.55), inset 0 1px 1px rgba(255,255,255,0.35)",
              }}
            >
              <div className="w-9 h-9 rounded-full bg-white/25 flex items-center justify-center shrink-0">
                <PartyPopper size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold flex items-center gap-1 leading-tight">
                  Novo lançamento! <Sparkles size={13} className="shrink-0" />
                </p>
                <p className="text-xs text-white/90 truncate mt-0.5">
                  <span className="font-medium">{b.unidade}</span> · @{b.login}
                </p>
                <p className="font-mono-num text-base font-bold mt-0.5">R$ {formatarMoeda(b.valor)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-2xl border border-line bg-white w-80">
              <div className="w-9 h-9 rounded-full bg-gold-soft flex items-center justify-center shrink-0 text-gold-strong">
                <Megaphone size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-0.5">Aviso do administrador</p>
                <p className="text-sm text-ink break-words">{b.texto}</p>
              </div>
              <button
                onClick={() => removerBalao(b.id)}
                title="Marcar como lido e fechar"
                className="shrink-0 w-7 h-7 rounded-full bg-teal-soft text-teal flex items-center justify-center hover:bg-teal hover:text-white transition"
              >
                <Check size={14} />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
