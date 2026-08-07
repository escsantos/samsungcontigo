"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Search, UploadCloud, LogOut } from "lucide-react";
import { supabase, getPerfilAtual } from "../lib/supabaseClient";
import BotaoTema from "./BotaoTema";

const ITENS_MENU = [
  { href: "/pecas", label: "Consulta de Peças", icone: Search, cargos: null },
  { href: "/pecas/carregar", label: "Carregar Bases", icone: UploadCloud, cargos: ["Administrador", "Diretor"] }
];

export default function AppShell({ titulo, children }) {
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const p = await getPerfilAtual();
      setPerfil(p);
      setCarregando(false);
    })();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (carregando) {
    return <div className="h-screen flex items-center justify-center bg-canvas text-muted text-sm">Carregando...</div>;
  }

  return (
    <div className="h-screen flex bg-canvas">
      <aside
        className="w-60 shrink-0 flex flex-col text-white"
        style={{ background: "linear-gradient(180deg, #132D44, #235685)" }}
      >
        <div className="px-5 py-6">
          <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo" className="h-9 w-auto brightness-0 invert opacity-90" />
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
          <h1 className="font-display font-semibold text-[15px] text-ink">{titulo}</h1>
          <div className="flex items-center gap-4">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-ink">{perfil?.nome || "-"}</p>
              <p className="text-[11.5px] text-muted">{perfil?.cargo || "-"}</p>
            </div>
            <BotaoTema />
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
