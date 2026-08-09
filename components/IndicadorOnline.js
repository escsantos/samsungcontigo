"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Avatar from "./Avatar";

export default function IndicadorOnline() {
  const [aberto, setAberto] = useState(false);
  const [lista, setLista] = useState([]);
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
        <div className="absolute right-0 top-10 z-40 card w-56 shadow-2xl p-2">
          {lista.length === 0 ? (
            <p className="text-xs text-muted p-2">Ninguém online no momento.</p>
          ) : (
            lista.map((u) => (
              <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-canvas">
                <Avatar nome={u.nome} fotoUrl={u.foto_url} tamanho={26} />
                <span className="text-xs">{u.nome}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
