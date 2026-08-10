"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, UploadCloud, LogOut, Home, Settings, Users, Bell, Percent, Contact,
  ShoppingCart, ClipboardList, Warehouse, FileBarChart, Briefcase, ChevronDown
} from "lucide-react";
import { supabase, getPerfilAtual } from "../lib/supabaseClient";
import BotaoTema from "./BotaoTema";
import SeletorCor, { aplicarAccent } from "./SeletorCor";
import Avatar from "./Avatar";
import SininhoNotificacoes from "./SininhoNotificacoes";
import IndicadorOnline from "./IndicadorOnline";
import { useCarrinho } from "../contexts/CarrinhoContext";

// Itens soltos, sempre no topo do menu (sem agrupar)
const ITENS_TOPO = [
  { href: "/pecas", label: "Consulta de Peças", icone: Search, cargos: null }
];

// Grupos recolhíveis
const GRUPOS_MENU = [
  {
    id: "vendas",
    label: "Vendas",
    icone: Briefcase,
    itens: [
      { href: "/clientes", label: "Clientes", icone: Contact, cargos: ["Administrador", "Diretor", "Gerente", "Vendedor"] },
      { href: "/orcamentos", label: "Orçamentos", icone: ClipboardList, cargos: ["Administrador", "Diretor", "Gerente", "Vendedor", "Cliente"] }
    ]
  },
  {
    id: "estoque",
    label: "Estoque",
    icone: Warehouse,
    itens: [
      { href: "/estoque", label: "Painel de Estoque", icone: Warehouse, cargos: ["Administrador", "Diretor", "Gerente", "Estoque"] },
      { href: "/estoque/relatorio", label: "Relatório de Custo", icone: FileBarChart, cargos: ["Administrador", "Diretor", "Gerente"] }
    ]
  },
  {
    id: "sistema",
    label: "Sistema",
    icone: Settings,
    itens: [
      { href: "/notificacoes", label: "Notificações", icone: Bell, cargos: ["Administrador", "Diretor", "Gerente"] },
      { href: "/configuracoes/carregar-bases", label: "Carregar Bases", icone: UploadCloud, cargos: ["Administrador"] },
      { href: "/configuracoes/impostos", label: "Impostos", icone: Percent, cargos: ["Administrador"] },
      { href: "/configuracoes/usuarios", label: "Usuários", icone: Users, cargos: ["Administrador", "Diretor", "Gerente"] }
    ]
  }
];

// mantido pra tela /configuracoes (hub de cards) continuar funcionando
export const ITENS_CONFIGURACOES = [
  { href: "/configuracoes/carregar-bases", label: "Carregar Bases", icone: UploadCloud, cargos: ["Administrador"], descricao: "Suba as planilhas de peças e ordens de serviço para atualizar a base de custos." },
  { href: "/configuracoes/impostos", label: "Impostos", icone: Percent, cargos: ["Administrador"], descricao: "Cadastre e gerencie os impostos usados no cálculo do preço de venda." },
  { href: "/configuracoes/usuarios", label: "Usuários", icone: Users, cargos: ["Administrador", "Diretor", "Gerente"], descricao: "Crie logins, defina cargos, resete senhas e controle o acesso ao sistema." },
  { href: "/estoque/relatorio", label: "Relatório de Custo", icone: FileBarChart, cargos: ["Administrador", "Diretor", "Gerente"], descricao: "Custo real, imposto, lucro líquido e margem das peças já liberadas." }
];

export default function AppShell({ titulo, children }) {
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [gruposAbertos, setGruposAbertos] = useState({});
  const pathname = usePathname();
  const router = useRouter();
  const heartbeatRef = useRef(null);
  const carrinho = useCarrinho();

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
      if (p?.senha_temporaria && pathname !== "/trocar-senha") {
        router.replace("/trocar-senha");
        return;
      }
      setPerfil(p);
      if (p?.cor_accent) {
        aplicarAccent(p.cor_accent);
      }
      setCarregando(false);

      async function marcarPresenca() {
        const { error } = await supabase
          .from("perfis")
          .update({ visto_em: new Date().toISOString() })
          .eq("id", p.id);
        if (error) {
          console.error("[presenca online] falha ao atualizar visto_em:", error.message, error);
        }
      }
      marcarPresenca();
      heartbeatRef.current = setInterval(marcarPresenca, 30000);
    })();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, [router]);

  // abre automaticamente o grupo que contém a página atual
  useEffect(() => {
    const grupoAtivo = GRUPOS_MENU.find((g) => g.itens.some((item) => pathname.startsWith(item.href)));
    if (grupoAtivo) {
      setGruposAbertos((atual) => ({ ...atual, [grupoAtivo.id]: true }));
    }
  }, [pathname]);

  function alternarGrupo(id) {
    setGruposAbertos((atual) => ({ ...atual, [id]: !atual[id] }));
  }

  async function sair() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (carregando) {
    return <div className="h-screen flex items-center justify-center bg-canvas text-muted text-sm">Carregando...</div>;
  }

  const podeComprar = ["Administrador", "Diretor", "Gerente", "Vendedor", "Cliente"].includes(perfil?.cargo);

  return (
    <div className="h-screen flex bg-canvas">
      <aside
        className="w-60 shrink-0 flex flex-col text-white no-print"
        style={{ background: "linear-gradient(180deg, var(--accent-dark), var(--accent))" }}
      >
        <div className="px-5 py-6 flex items-center gap-3">
          <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo" className="h-9 w-auto brightness-0 invert opacity-90" />
          <Link
            href="/inicio"
            aria-label="Início"
            title="Início"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white transition"
          >
            <Home size={16} />
          </Link>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {ITENS_TOPO.filter((item) => !item.cargos || item.cargos.includes(perfil?.cargo)).map((item) => {
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

          {GRUPOS_MENU.map((grupo) => {
            const itensVisiveis = grupo.itens.filter((item) => item.cargos.includes(perfil?.cargo));
            if (itensVisiveis.length === 0) return null;
            const GrupoIcone = grupo.icone;
            const aberto = !!gruposAbertos[grupo.id];
            const grupoAtivo = itensVisiveis.some((item) => pathname.startsWith(item.href));

            return (
              <div key={grupo.id} className="pt-1">
                <button
                  onClick={() => alternarGrupo(grupo.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    grupoAtivo && !aberto ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <GrupoIcone size={17} />
                  <span className="flex-1 text-left">{grupo.label}</span>
                  <ChevronDown size={14} className="transition-transform" style={{ transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }} />
                </button>

                {aberto && (
                  <div className="mt-0.5 space-y-0.5">
                    {itensVisiveis.map((item) => {
                      const Icone = item.icone;
                      const ativo = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`flex items-center gap-3 pl-9 pr-3 py-2 rounded-lg text-[13px] font-medium transition ${
                            ativo ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                          }`}
                        >
                          <Icone size={14} />
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
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
        <header className="h-16 shrink-0 flex items-center justify-between px-6 border-b border-line bg-surface no-print">
          <div className="flex items-center gap-3">
            <SininhoNotificacoes visivel={["Administrador", "Diretor", "Gerente"].includes(perfil?.cargo)} />
            <h1 className="font-display font-semibold text-[15px] text-ink">{titulo}</h1>
          </div>
          <div className="flex items-center gap-3">
            {podeComprar && (
              <Link
                href="/carrinho"
                className="relative w-9 h-9 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink transition"
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
              >
                <ShoppingCart size={16} />
                {carrinho?.totalItens > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
                    {carrinho.totalItens > 9 ? "9+" : carrinho.totalItens}
                  </span>
                )}
              </Link>
            )}
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
