"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Avatar from "./Avatar";

function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function IndicadorOnline() {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
  const [expandido, setExpandido] = useState(null);
  const ref = useRef(null);

  async function carregar() {
    const { data, error } = await supabase.rpc("usuarios_online");
    if (error) {
      console.error("Falha ao buscar usuarios_online:", error.message);
      return;
    }
    setLista(data || []);
  }

  useEffect(() => {
    carregar();
    const intervalo = setInterval(carregar, 30000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    function fora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full border border-line text-xs font-medium text-ink transition"
        style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}
      >
        <span className="relative w-2.5 h-2.5 rounded-full" style={{ background: "#3FA796", boxShadow: "0 0 0 2px rgba(63,167,150,0.25)" }}>
          <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "#3FA796", opacity: 0.6 }} />
        </span>
        {lista.length} online
      </button>

      {aberto && (
        <div className="absolute right-0 top-10 z-40 card w-64 shadow-2xl p-2 max-h-80 overflow-auto">
          {lista.length === 0 ? (
            <p className="text-xs text-muted p-2">Ninguém online no momento.</p>
          ) : (
            lista.map((u) => (
              <div key={u.id}>
                <button
                  type="button"
                  onClick={() => setExpandido((v) => (v === u.id ? null : u.id))}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas text-left"
                >
                  <Avatar nome={u.nome} fotoUrl={u.foto_url} tamanho={26} />
                  <span className="text-xs flex-1 truncate">{u.nome}</span>
                </button>
                {expandido === u.id && (
                  <div className="pl-[42px] pr-2 pb-2 -mt-0.5 text-[11px] text-muted leading-relaxed">
                    <p>Login: <span className="font-mono text-ink">{u.login || "—"}</span></p>
                    <p>Desde: <span className="font-mono text-ink">{fmtDataHora(u.ultimo_login_em)}</span></p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
