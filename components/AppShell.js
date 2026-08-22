"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, UploadCloud, LogOut, Home, Settings, Users, Bell, Percent, Contact,
  ShoppingCart, ClipboardList, Warehouse, FileBarChart, Briefcase, ChevronDown, LayoutDashboard, Menu, X, Receipt,
  Wallet, ClipboardCheck, Truck, Building2, Database, RotateCcw, ScrollText
} from "lucide-react";
import { supabase, getPerfilAtual } from "../lib/supabaseClient";
import { getUnidadeAtiva, setUnidadeAtiva, buscarUnidadesDoUsuario, limparUnidadeAtiva } from "../lib/unidade";
import { registrarAuditoria } from "../lib/auditoria";
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

// Grupos recolhíveis — cada um tem uma tela de cards própria (href do grupo)
export const GRUPOS_MENU = [
  {
    id: "vendas",
    label: "Vendas",
    icone: Briefcase,
    href: "/menu/vendas",
    itens: [
      { href: "/dashboard", label: "Dashboard de Vendas", icone: LayoutDashboard, cor: "#3FA796", descricao: "Cards, gráficos e ranking de vendas por período.", cargos: ["Administrador", "Diretor", "Gerente", "Vendedor"] },
      { href: "/clientes", label: "Clientes", icone: Contact, cor: "#8B5CF6", descricao: "Cadastre e gerencie os clientes da loja.", cargos: ["Administrador", "Diretor", "Gerente", "Vendedor"] },
      { href: "/orcamentos", label: "Orçamentos", icone: ClipboardList, cor: "#4A90D9", descricao: "Acompanhe pedidos e revise carrinhos enviados pelos clientes.", cargos: ["Administrador", "Diretor", "Gerente", "Vendedor", "Cliente"] },
      { href: "/pagamentos", label: "Pagamentos", icone: Receipt, cor: "#E1614F", descricao: "Busque um pedido pelo número e registre ou ajuste o pagamento.", cargos: ["Administrador", "Diretor", "Gerente", "Vendedor", "Estoque"] }
    ]
  },
  {
    id: "estoque",
    label: "Estoque",
    icone: Warehouse,
    href: "/menu/estoque",
    itens: [
      { href: "/estoque", label: "Painel de Estoque", icone: Warehouse, cor: "#2E7F97", descricao: "Acompanhe a linha do tempo dos pedidos e libere peças por Delivery.", cargos: ["Administrador", "Diretor", "Gerente", "Estoque"] },
      { href: "/estoque/pedidos", label: "Relatório de Pedidos", icone: ClipboardList, cor: "#7A4FB0", descricao: "Todos os pedidos com filtros completos, exporta para Excel.", cargos: ["Administrador", "Diretor", "Gerente", "Estoque"] },
      { href: "/estoque/relatorio", label: "Relatório de Custo", icone: FileBarChart, cor: "#4338CA", descricao: "Custo real, imposto e lucro líquido das peças já liberadas.", cargos: ["Administrador", "Diretor", "Gerente"] }
    ]
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icone: Wallet,
    href: "/financeiro",
    itens: [
      { href: "/financeiro", label: "Dashboard Financeiro", icone: Wallet, cor: "#2C7C6E", descricao: "Recebido, pago ao fabricante e margem, com filtro por período.", cargos: ["Administrador", "Financeiro"] },
      { href: "/financeiro/recebimentos", label: "Confirmar Recebimentos", icone: ClipboardCheck, cor: "#3FA796", descricao: "Confirme se o pagamento do cliente realmente entrou.", cargos: ["Administrador", "Financeiro"] },
      { href: "/financeiro/fornecedor", label: "Pagamento ao Fabricante", icone: Truck, cor: "#E1614F", descricao: "Confirme o pagamento do custo das peças à Samsung, por semana/cliente/data.", cargos: ["Administrador", "Financeiro"] },
      { href: "/financeiro/estornos", label: "Estornos", icone: RotateCcw, cor: "#9C5A34", descricao: "Processe solicitações de estorno de pedidos cancelados.", cargos: ["Administrador", "Financeiro"] }
    ]
  },
  {
    id: "sistema",
    label: "Sistema",
    icone: Settings,
    href: "/configuracoes",
    itens: [
      { href: "/notificacoes", label: "Notificações", icone: Bell, cor: "#E1614F", descricao: "Avisos do sistema, como solicitações de redefinição de senha.", cargos: ["Administrador", "Diretor", "Gerente"] },
      { href: "/configuracoes/carregar-bases", label: "Carregar Bases", icone: UploadCloud, cor: "#2E6DA8", descricao: "Suba as planilhas de peças e ordens de serviço para atualizar a base.", cargos: ["Administrador"] },
      { href: "/configuracoes/impostos", label: "Impostos", icone: Percent, cor: "#C2801F", descricao: "Cadastre os impostos usados no cálculo do preço de venda.", cargos: ["Administrador"] },
      { href: "/configuracoes/usuarios", label: "Usuários", icone: Users, cor: "#7A4FB0", descricao: "Crie logins, defina cargos e controle o acesso ao sistema.", cargos: ["Administrador", "Diretor", "Gerente"] },
      { href: "/configuracoes/unidades", label: "Unidades", icone: Building2, cor: "#2C7C6E", descricao: "Cadastre as unidades do grupo e o ASC COD. de cada uma.", cargos: ["Administrador"] },
      { href: "/configuracoes/manutencao", label: "Manutenção", icone: Database, cor: "#E1614F", descricao: "Contagem de registros, backup manual e limpeza de orçamentos por unidade.", cargos: ["Administrador"] },
      { href: "/configuracoes/auditoria", label: "Auditoria", icone: ScrollText, cor: "#2E6DA8", descricao: "Login/logout, alterações de usuário e movimentações do sistema.", cargos: ["Administrador", "Diretor", "Gerente"] }
    ]
  }
];

// mantido pra tela /configuracoes (hub de cards) continuar funcionando
export const ITENS_CONFIGURACOES = GRUPOS_MENU.find((g) => g.id === "sistema").itens;

export default function AppShell({ titulo, children }) {
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const [unidadeAtiva, setUnidadeAtivaState] = useState(null);
  const [unidadesDoUsuario, setUnidadesDoUsuario] = useState([]);
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
        limparUnidadeAtiva();
        router.replace("/login?bloqueado=1");
        return;
      }
      if (p?.senha_temporaria && pathname !== "/trocar-senha") {
        router.replace("/trocar-senha");
        return;
      }

      const unidades = await buscarUnidadesDoUsuario(supabase, p.id);
      let ativa = getUnidadeAtiva();
      if (ativa && !unidades.some((u) => u.id === ativa.id)) ativa = null;
      if (!ativa) {
        if (unidades.length === 0) {
          await supabase.auth.signOut();
          limparUnidadeAtiva();
          router.replace("/login?semunidade=1");
          return;
        } else if (unidades.length === 1) {
          setUnidadeAtiva(unidades[0]);
          ativa = unidades[0];
        } else {
          router.replace("/selecionar-unidade");
          return;
        }
      }
      setUnidadeAtivaState(ativa);
      setUnidadesDoUsuario(unidades);

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

  // fecha o menu mobile ao trocar de página
  useEffect(() => {
    setMenuMobileAberto(false);
  }, [pathname]);

  async function sair() {
    await registrarAuditoria({
      tipoEvento: "logout",
      entidade: "perfis",
      entidadeId: perfil?.id,
      descricao: `Logout de ${perfil?.nome || ""}.`,
      usuarioId: perfil?.id
    });
    await supabase.auth.signOut();
    limparUnidadeAtiva();
    router.replace("/login");
  }

  if (carregando) {
    return <div className="h-screen flex items-center justify-center bg-canvas text-muted text-sm">Carregando...</div>;
  }

  const podeComprar = ["Administrador", "Diretor", "Gerente", "Vendedor", "Cliente"].includes(perfil?.cargo);

  return (
    <div className="h-screen flex bg-canvas">
      {menuMobileAberto && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMenuMobileAberto(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 md:w-60 shrink-0 flex flex-col text-white no-print transform transition-transform duration-200 ${
          menuMobileAberto ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{ background: "linear-gradient(180deg, var(--accent-dark), var(--accent))" }}
      >
        <div className="px-5 py-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
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
          <button
            onClick={() => setMenuMobileAberto(false)}
            className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:bg-white/15 hover:text-white"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
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
            const grupoAtivo = itensVisiveis.some((item) => pathname.startsWith(item.href)) || pathname === grupo.href;
            const aberto = grupoAtivo;

            return (
              <div key={grupo.id} className="pt-1">
                <Link
                  href={grupo.href}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    grupoAtivo ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <GrupoIcone size={17} />
                  <span className="flex-1 text-left">{grupo.label}</span>
                  <ChevronDown size={14} className="transition-transform" style={{ transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }} />
                </Link>

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
        <header className="h-16 shrink-0 flex items-center justify-between px-3 md:px-6 border-b border-line bg-surface no-print gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button
              onClick={() => setMenuMobileAberto(true)}
              className="md:hidden w-9 h-9 shrink-0 flex items-center justify-center rounded-full border border-line text-muted hover:text-ink"
              aria-label="Abrir menu"
            >
              <Menu size={17} />
            </button>
            <SininhoNotificacoes visivel={["Administrador", "Diretor", "Gerente"].includes(perfil?.cargo)} />
            <h1 className="font-display font-semibold text-[15px] text-ink truncate">{titulo}</h1>
            {unidadeAtiva && (
              <button
                onClick={() => unidadesDoUsuario.length > 1 && router.push("/selecionar-unidade?trocar=1")}
                title={unidadesDoUsuario.length > 1 ? "Clique pra trocar de unidade" : unidadeAtiva.nome}
                className="hidden sm:flex items-center gap-1.5 text-[10.5px] font-mono font-bold px-2.5 py-1 rounded-full shrink-0"
                style={{
                  background: "var(--accent-soft)",
                  color: "var(--accent)",
                  cursor: unidadesDoUsuario.length > 1 ? "pointer" : "default"
                }}
              >
                <Building2 size={11} />
                {unidadeAtiva.nome}
                {unidadesDoUsuario.length > 1 && <ChevronDown size={10} />}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
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
            <span className="hidden lg:block"><IndicadorOnline /></span>
            <Link href="/perfil" className="flex items-center gap-2.5 hover:opacity-80 transition">
              <div className="text-right leading-tight hidden sm:block">
                <p className="text-sm font-medium text-ink">{perfil?.nome || "-"}</p>
                <p className="text-[11.5px] text-muted">{perfil?.cargo || "-"}</p>
              </div>
              <Avatar nome={perfil?.nome} fotoUrl={perfil?.foto_url} tamanho={34} />
            </Link>
            <span className="hidden sm:flex items-center gap-1.5 md:gap-3">
              <SeletorCor perfil={perfil} />
              <BotaoTema />
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}
