"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UploadCloud, LogOut, Home, Settings, Users, Bell, Percent } from "lucide-react";
import { supabase, getPerfilAtual } from "../lib/supabaseClient";
import BotaoTema from "./BotaoTema";
import SeletorCor, { aplicarAccent } from "./SeletorCor";
import Avatar from "./Avatar";
import SininhoNotificacoes from "./SininhoNotificacoes";
import IndicadorOnline from "./IndicadorOnline";

const ITENS_MENU = [
  { href: "/pecas", label: "Consulta de Peças", icone: Search, cargos: null },
  { href: "/notificacoes", label: "Notificações", icone: Bell, cargos: ["Administrador", "Diretor", "Gerente"] }
];

const ITENS_CONFIGURACOES = [
  { href: "/configuracoes/carregar-bases", label: "Carregar Bases", icone: UploadCloud, cargos: ["Administrador"] },
  { href: "/configuracoes/impostos", label: "Impostos", icone: Percent, cargos: ["Administrador"] },
  { href: "/configuracoes/usuarios", label: "Usuários", icone: Users, cargos: ["Administrador", "Diretor", "Gerente"] }
];

export default function AppShell({ titulo, children }) {
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const pathname = usePathname();
  const router = useRouter();
  const heartbeatRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const p = await getPerfilAtual();
      if (p?.bloqueado) {
        await supabase.auth.signOut();
        router.replace("/login?bloqueado=1");
        return;
      }
      setPerfil(p);
      if (p?.cor_accent) {
        aplicarAccent(p.cor_accent);
      }
      setCarregando(false);

      // presença online: atualiza visto_em ao entrar e a cada ~30s
      const marcarPresenca = () => supabase.from("perfis").update({ visto_em: new Date().toISOString() }).eq("id", p.id);
      marcarPresenca();
      heartbeatRef.current = setInterval(marcarPresenca, 30000);
    })();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (carregando) {
    return <div className="h-screen flex items-center justify-center bg-canvas text-muted text-sm">Carregando...</div>;
  }

  const subItensVisiveis = ITENS_CONFIGURACOES.filter((item) => item.cargos.includes(perfil?.cargo));

  return (
    <div className="h-screen flex bg-canvas">
      <aside
        className="w-60 shrink-0 flex flex-col text-white"
        style={{ background: "linear-gradient(180deg, var(--accent-dark), var(--accent))" }}
      >
        <div className="px-5 py-6 flex items-center gap-3">
          <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo" className="h-9 w-auto brightness-0 invert opacity-90" />
          <Link
            href="/pecas"
            aria-label="Início"
            title="Início"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition"
          >
            <Home size={16} />
          </Link>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {ITENS_MENU.filter((item) => !item.cargos || item.cargos.includes(perfil?.cargo)).map((item) => {
            const Icone = item.icone;
            const ativo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  ativo ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icone size={17} />
                {item.label}
              </Link>
            );
          })}

          {subItensVisiveis.length > 0 && (
            <>
              <div className="flex items-center gap-2 px-3 pt-4 pb-1.5 text-[11px] font-semibold tracking-wide text-white/50 uppercase">
                <Settings size={13} />
                Configurações
              </div>
              {subItensVisiveis.map((item) => {
                const Icone = item.icone;
                const ativo = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 pl-6 pr-3 py-2.5 rounded-lg text-sm font-medium transition ${
                      ativo ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icone size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </>
          )}
        </nav>
        <button
          onClick={sair}
          className="mx-3 mb-5 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
        >
          <LogOut size={17} />
          Sair
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-line bg-surface">
          <div className="flex items-center gap-3">
            <SininhoNotificacoes visivel={["Administrador", "Diretor", "Gerente"].includes(perfil?.cargo)} />
            <h1 className="font-display font-semibold text-[15px] text-ink">{titulo}</h1>
          </div>
          <div className="flex items-center gap-3">
            <IndicadorOnline />
            <Link href="/perfil" className="flex items-center gap-2.5 hover:opacity-80 transition">
              <div className="text-right leading-tight">
                <p className="text-sm font-medium text-ink">{perfil?.nome || "-"}</p>
                <p className="text-[11.5px] text-muted">{perfil?.cargo || "-"}</p>
              </div>
              <Avatar nome={perfil?.nome} fotoUrl={perfil?.foto_url} tamanho={34} />
            </Link>
            <SeletorCor perfil={perfil} />
            <BotaoTema />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
