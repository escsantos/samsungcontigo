"use client";
import { useEffect, useState } from "react";
import { KeyRound, Check, ShieldAlert } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";

export default function NotificacoesPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [notificacoes, setNotificacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      await carregar();
    })();
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase.from("notificacoes").select("*").order("criado_em", { ascending: false });
    setNotificacoes(data || []);
    setCarregando(false);
  }

  async function marcarComoLida(n) {
    await supabase.from("notificacoes").update({ lida: true }).eq("id", n.id);
    setNotificacoes((atual) => atual.map((x) => (x.id === n.id ? { ...x, lida: true } : x)));
  }

  async function marcarTodasComoLidas() {
    const idsNaoLidas = notificacoes.filter((n) => !n.lida).map((n) => n.id);
    if (idsNaoLidas.length === 0) return;
    await supabase.from("notificacoes").update({ lida: true }).in("id", idsNaoLidas);
    setNotificacoes((atual) => atual.map((n) => ({ ...n, lida: true })));
  }

  if (perfil === undefined) {
    return <AppShell titulo="Notificações"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Notificações">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor e Gerente veem notificações.</p>
        </div>
      </AppShell>
    );
  }

  const naoLidas = notificacoes.filter((n) => !n.lida).length;

  return (
    <AppShell titulo="Notificações">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted">
          {notificacoes.length} notificaç{notificacoes.length === 1 ? "ão" : "ões"}
          {naoLidas > 0 ? ` · ${naoLidas} não lida(s)` : ""}
        </p>
        {naoLidas > 0 && (
          <button className="btn-secondary text-xs py-2" onClick={marcarTodasComoLidas}>
            <Check size={13} />
            Marcar todas como lidas
          </button>
        )}
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : notificacoes.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhuma notificação por aqui.</p>
        ) : (
          notificacoes.map((n) => (
            <div
              key={n.id}
              className="flex items-start gap-3 px-5 py-4 border-b border-line last:border-0"
              style={{ background: n.lida ? "transparent" : "var(--accent-soft)" }}
            >
              <KeyRound size={17} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div className="flex-1">
                <p className="text-sm">{n.mensagem}</p>
                <p className="text-xs text-muted mt-1">
                  {new Date(n.criado_em).toLocaleDateString("pt-BR")} às{" "}
                  {new Date(n.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!n.lida && (
                <button className="btn-secondary text-xs py-1.5 px-3 shrink-0" onClick={() => marcarComoLida(n)}>
                  Marcar como lida
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
