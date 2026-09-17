"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import Modal from "./Modal";
import { supabase } from "../lib/supabaseClient";
import { podeVerSolicitacoesSenha } from "../lib/permissions";

export default function SinoSolicitacoesSenha({ usuario }) {
  const [pedidos, setPedidos] = useState([]);
  const [aberto, setAberto] = useState(false);

  async function carregar() {
    const { data } = await supabase
      .from("solicitacoes_senha")
      .select("*")
      .eq("atendida", false)
      .order("criado_em", { ascending: false });
    setPedidos(data || []);
  }

  useEffect(() => {
    if (!podeVerSolicitacoesSenha(usuario.cargo)) return;
    carregar();
    const intervalo = setInterval(carregar, 60000);
    return () => clearInterval(intervalo);
  }, [usuario]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!podeVerSolicitacoesSenha(usuario.cargo)) return null;

  async function marcarResolvido(id) {
    const { data: sessao } = await supabase.auth.getSession();
    await supabase
      .from("solicitacoes_senha")
      .update({ atendida: true, atendida_por: sessao.session.user.id, atendida_em: new Date().toISOString() })
      .eq("id", id);
    carregar();
  }

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        title="Solicitações de redefinição de senha"
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:bg-canvas hover:text-ink transition"
      >
        <KeyRound size={17} />
        {pedidos.length > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">
            {pedidos.length}
          </span>
        )}
      </button>

      {aberto && (
        <Modal titulo="Solicitações de senha" subtitulo={`${pedidos.length} pedido(s) pendente(s)`} onFechar={() => setAberto(false)}>
          {pedidos.length === 0 ? (
            <p className="text-sm text-muted">Nenhum pedido pendente. 🎉</p>
          ) : (
            <div className="space-y-2">
              {pedidos.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                  <div>
                    <p className="font-mono-num font-medium">{p.login}</p>
                    <p className="text-xs text-muted">{new Date(p.criado_em).toLocaleString("pt-BR")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href="/configuracoes/usuarios" className="btn text-xs">Ir para Usuários</Link>
                    <button className="btn text-xs text-teal" onClick={() => marcarResolvido(p.id)}>Marcar resolvido</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
