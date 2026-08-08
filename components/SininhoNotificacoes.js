"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, KeyRound } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

export default function SininhoNotificacoes({ visivel }) {
  const [aberto, setAberto] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);
  const ref = useRef(null);
  const router = useRouter();

  async function carregar() {
    const { data } = await supabase
      .from("notificacoes")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(20);
    setNotificacoes(data || []);
  }

  useEffect(() => {
    if (!visivel) return;
    carregar();
    const intervalo = setInterval(carregar, 30000);
    return () => clearInterval(intervalo);
  }, [visivel]);

  useEffect(() => {
    function fora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  if (!visivel) return null;

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  async function marcarComoLida(n) {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", n.id);
    setNotificacoes((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-label="Notificações"
        className="relative w-9 h-9 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink transition"
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
      >
        <Bell size={16} />
        {naoLidas > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute left-0 top-11 z-40 card w-80 shadow-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <p className="font-display font-semibold text-sm">Notificações</p>
            <button
              onClick={() => router.push("/notificacoes")}
              className="text-[11px] font-medium"
              style={{ color: "var(--accent)" }}
            >
              Ver todas
            </button>
          </div>
          <div className="max-h-80 overflow-auto">
            {notificacoes.length === 0 ? (
              <p className="text-sm text-muted p-4">Nenhuma notificação por aqui.</p>
            ) : (
              notificacoes.slice(0, 8).map((n) => (
                <button
                  key={n.id}
                  onClick={() => marcarComoLida(n)}
                  className="w-full text-left px-4 py-3 border-b border-line last:border-0 hover:bg-canvas flex gap-2.5"
                  style={{ opacity: n.lida ? 0.55 : 1 }}
                >
                  <KeyRound size={15} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
                  <div>
                    <p className="text-xs">{n.mensagem}</p>
                    <p className="text-[10.5px] text-muted mt-0.5">
                      {new Date(n.criado_em).toLocaleDateString("pt-BR")} às{" "}
                      {new Date(n.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
