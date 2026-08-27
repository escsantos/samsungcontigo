"use client";
import { useEffect, useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

const JANELA_ONLINE_MS = 2 * 60 * 1000; // considera "online" quem deu sinal nos últimos 2 min
const INTERVALO_VERIFICACAO_MS = 20000;

function BolinhaOnline({ size = 10 }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: "radial-gradient(circle at 35% 30%, #6EE7A8, #16A34A 65%, #0F7A38)",
        boxShadow: "0 1px 2px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.6), 0 0 0 2px white",
      }}
    />
  );
}

export default function BotaoUsuariosOnline() {
  const { usuario } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [online, setOnline] = useState([]);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const containerRef = useRef(null);

  async function enviarSinal() {
    await supabase.from("usuarios").update({ ultimo_acesso: new Date().toISOString() }).eq("id", usuario.id);
  }

  async function verificarOnline() {
    const limite = new Date(Date.now() - JANELA_ONLINE_MS).toISOString();
    const { data } = await supabase
      .from("usuarios")
      .select("id, nome_completo, login")
      .gte("ultimo_acesso", limite)
      .order("nome_completo");
    setOnline(data || []);
  }

  useEffect(() => {
    enviarSinal();
    verificarOnline().finally(() => setCarregandoInicial(false));
    const intervaloSinal = setInterval(enviarSinal, 40000);
    const intervaloVerifica = setInterval(verificarOnline, INTERVALO_VERIFICACAO_MS);
    return () => {
      clearInterval(intervaloSinal);
      clearInterval(intervaloVerifica);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function aoClicarFora(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAberto(false);
    }
    window.addEventListener("mousedown", aoClicarFora);
    return () => window.removeEventListener("mousedown", aoClicarFora);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setAberto((v) => !v)}
        title="Usuários online agora"
        className="relative text-muted hover:text-gold transition"
      >
        <Users size={19} />
        {!carregandoInicial && online.length > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-semibold flex items-center justify-center"
            style={{
              background: "radial-gradient(circle at 35% 30%, #6EE7A8, #16A34A 65%, #0F7A38)",
              boxShadow: "0 1px 2px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.6), 0 0 0 2px white",
            }}
          >
            {online.length > 99 ? "99+" : online.length}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl2 shadow-2xl border border-line z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-line">
            <p className="font-display text-sm font-semibold text-ink">Online agora ({online.length})</p>
            <button onClick={() => setAberto(false)} className="text-muted hover:text-ink transition">
              <X size={14} />
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {online.length === 0 && <p className="text-sm text-muted text-center py-6">Ninguém mais online agora.</p>}
            {online.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-canvas transition">
                <BolinhaOnline size={11} />
                <div className="min-w-0">
                  <p className="text-ink truncate">{u.nome_completo}</p>
                  <p className="text-[11px] text-muted font-mono-num">@{u.login}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
