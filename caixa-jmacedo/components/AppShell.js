"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  ReceiptText,
  Wallet,
  Store,
  Users,
  Wrench,
  Boxes,
  Tags,
  Target,
  Tv,
  LogOut,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  TrendingUp,
  ScrollText,
  Home,
  Search,
  FileSpreadsheet,
  DollarSign,
  UserCheck,
  Cable,
  Receipt,
  DatabaseZap,
  Briefcase,
  BarChart3,
} from "lucide-react";
import BotaoModoClaroEscuro from "./BotaoModoClaroEscuro";
import SinoSolicitacoesSenha from "./SinoSolicitacoesSenha";
import BotaoLinhaToggle from "./BotaoLinhaToggle";
import BotaoFiltroMarca from "./BotaoFiltroMarca";
import BotaoMural from "./BotaoMural";
import BotaoUsuariosOnline from "./BotaoUsuariosOnline";
import BotaoAvisoAdmin from "./BotaoAvisoAdmin";
import BalaoNotificacoes from "./BalaoNotificacoes";
import { SessaoProvider, useSessao } from "../lib/SessaoContext";
import {
  rotuloCargo,
  podeConfigTiposServico,
  podeConfigCategorias,
  podeConfigModelos,
  podeConfigUnidades,
  podeConfigUsuarios,
  podeConfigMetas,
  temAcessoConfiguracoes,
  podeVerLogAuditoria,
  podeVerManutencao,
  podeVerEstatisticas,
} from "../lib/permissions";

export const NAV_OPERACAO = [
  { href: "/lancamento", label: "Lançamento", icon: ReceiptText, descricao: "Registrar um novo pagamento de ordem de serviço." },
  { href: "/consulta", label: "Consulta", icon: Search, descricao: "Buscar lançamentos por OS, data ou categoria." },
  { href: "/contas-a-receber", label: "Contas a receber", icon: Wallet, descricao: "OS com saldo em aberto, aguardando quitação." },
  { href: "/acompanhamento", label: "Acompanhamento", icon: TrendingUp, descricao: "Evolução das vendas: diário, semanal ou mensal." },
  { href: "/relatorios", label: "Relatórios", icon: FileSpreadsheet, descricao: "Exportar os dados lançados para Excel." },
  { href: "/relatorios/pareto", label: "Pareto", icon: BarChart3, descricao: "Compare o volume e os valores por dia da semana." },
];

export const NAV_DASHBOARD = [
  { href: "/dashboard/valores-diario", label: "Valores (Diário)", icon: LayoutDashboard, descricao: "Resultado de hoje, por unidade, com ranking." },
  { href: "/dashboard/valores-semanal", label: "Valores (Semanal)", icon: LayoutDashboard, descricao: "Resultado da semana (domingo a sábado), por unidade." },
  { href: "/dashboard", label: "Valores (Mensal)", icon: LayoutDashboard, descricao: "Resultado do mês, por unidade, com ranking." },
  { href: "/dashboard/metas", label: "Metas", icon: Target, descricao: "Progresso da meta mensal de cada unidade." },
  { href: "/dashboard/ow", label: "Orçamentos (OW)", icon: Receipt, descricao: "Todas as vendas do mês, por unidade — exceto acessórios." },
  { href: "/dashboard/vendedores", label: "Vendedores", icon: UserCheck, descricao: "Ranking de vendas de acessórios por atendente." },
  { href: "/dashboard/acessorios", label: "Acessórios", icon: Cable, descricao: "Vendas de acessórios por tipo de item." },
];

export function navConfiguracoes(cargo) {
  const itens = [];
  if (podeConfigTiposServico(cargo)) itens.push({ href: "/configuracoes/tipos-servico", label: "Tipos de serviço", icon: Wrench, descricao: "Cadastro dos tipos de serviço prestados." });
  if (podeConfigCategorias(cargo)) itens.push({ href: "/configuracoes/categorias", label: "Categorias", icon: Tags, descricao: "Categorias de produto (Celular, TV, Tablet...)." });
  if (podeConfigModelos(cargo)) itens.push({ href: "/configuracoes/modelos", label: "Modelos", icon: Boxes, descricao: "Modelos de produto atendidos, por categoria." });
  if (podeConfigUnidades(cargo)) itens.push({ href: "/configuracoes/unidades", label: "Unidades", icon: Store, descricao: "Lojas do grupo e seus códigos internos." });
  if (podeConfigUsuarios(cargo)) itens.push({ href: "/configuracoes/usuarios", label: "Usuários", icon: Users, descricao: "Logins, cargos e unidades autorizadas." });
  if (podeConfigMetas(cargo)) itens.push({ href: "/configuracoes/metas", label: "Metas", icon: Target, descricao: "Meta mensal de cada unidade." });
  if (podeVerLogAuditoria(cargo)) itens.push({ href: "/configuracoes/log", label: "Log do sistema", icon: ScrollText, descricao: "Histórico de alterações no sistema." });
  if (podeVerManutencao(cargo)) itens.push({ href: "/configuracoes/manutencao", label: "Manutenção do banco", icon: DatabaseZap, descricao: "Apagar dados de teste antes de usar o sistema de verdade." });
  if (podeVerEstatisticas(cargo)) itens.push({ href: "/configuracoes/estatisticas", label: "Estatísticas", icon: BarChart3, descricao: "Métricas e tendências de uso do sistema." });
  return itens;
}

// cor própria por item — dá pra escanear o menu rápido, cada tela com seu tom
const CORES_ITEM = {
  "/lancamento": "#2670B5",
  "/consulta": "#7C56B5",
  "/contas-a-receber": "#3F8A5C",
  "/acompanhamento": "#C9752E",
  "/relatorios": "#0E7A72",
  "/relatorios/pareto": "#B8862E",
  "/dashboard/valores-diario": "#2670B5",
  "/dashboard/valores-semanal": "#3E6FB0",
  "/dashboard": "#2E5A94",
  "/dashboard/metas": "#B8862E",
  "/dashboard/ow": "#9C5A34",
  "/dashboard/vendedores": "#0E7A72",
  "/dashboard/acessorios": "#9B5FB0",
  "/configuracoes/tipos-servico": "#5B6B84",
  "/configuracoes/categorias": "#C9A227",
  "/configuracoes/modelos": "#4C94D6",
  "/configuracoes/unidades": "#3F8A5C",
  "/configuracoes/usuarios": "#7C56B5",
  "/configuracoes/metas": "#B8862E",
  "/configuracoes/log": "#7C819C",
  "/configuracoes/manutencao": "#B23B2E",
  "/configuracoes/estatisticas": "#2E6B7A",
};

const CORES_SECAO = {
  operacao: "#1B3A5C",
  dashboard: "#B8862E",
  configuracoes: "#5B6B84",
  painel: "#0E7A72",
};

/** Selo colorido com efeito 3D (gradiente + sombra) em volta do ícone. */
function IconeSelo({ icone: Icone, cor, tamanho = 14, caixa = 22 }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: caixa,
        height: caixa,
        background: `radial-gradient(circle at 30% 25%, ${cor}, ${cor}CC 70%)`,
        boxShadow: "0 2px 3px rgba(0,0,0,0.28), inset 0 1px 1px rgba(255,255,255,0.55), inset 0 -1px 1px rgba(0,0,0,0.12)",
      }}
    >
      <Icone size={tamanho} className="text-white" strokeWidth={2.2} />
    </span>
  );
}

function ItemNav({ item, ativo, recolhido }) {
  const Icone = item.icon;
  const cor = CORES_ITEM[item.href] || "#7C819C";
  return (
    <Link
      href={item.href}
      title={recolhido ? item.label : undefined}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition
        ${ativo ? "bg-gold/15 text-gold font-medium" : "text-muted hover:bg-ink/5 hover:text-ink"}
        ${recolhido ? "justify-center" : ""}`}
    >
      <IconeSelo icone={Icone} cor={cor} />
      {!recolhido && item.label}
    </Link>
  );
}

function SecaoNav({ titulo, hrefHub, icone: Icone, corSecao, itens, pathname, recolhido, aberta, onToggle, aoClicarNome }) {
  if (recolhido) {
    return (
      <div className="space-y-0.5">
        {itens.map((item) => (
          <ItemNav key={item.href} item={item} ativo={pathname === item.href} recolhido={recolhido} />
        ))}
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center justify-between px-3 mb-2">
        <Link
          href={hrefHub}
          onClick={aoClicarNome}
          className="text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition font-bold"
          style={{ color: "#1B3A5C" }}
        >
          {Icone && <IconeSelo icone={Icone} cor={corSecao || "#7C819C"} tamanho={10} caixa={17} />}{titulo}
        </Link>
        <button onClick={onToggle} className="text-muted hover:text-ink p-0.5">
          <ChevronDown size={12} className={`transition-transform ${aberta ? "" : "-rotate-90"}`} />
        </button>
      </div>
      {aberta && (
        <div className="space-y-0.5">
          {itens.map((item) => (
            <ItemNav key={item.href} item={item} ativo={pathname === item.href} recolhido={recolhido} />
          ))}
        </div>
      )}
    </div>
  );
}

function secaoDaRota(pathname) {
  if (NAV_OPERACAO.some((i) => i.href === pathname) || pathname === "/operacao") return "operacao";
  if (NAV_DASHBOARD.some((i) => i.href === pathname)) return "dashboard";
  if (pathname.startsWith("/configuracoes")) return "configuracoes";
  return null;
}

function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, unidades, sair, podeAlternarLinha } = useSessao();
  const [recolhido, setRecolhido] = useState(false); // painel lateral sempre visível por padrão
  const [secaoAberta, setSecaoAberta] = useState(() => secaoDaRota(pathname));
  const ignorarProximaAutoAbertura = useRef(false);

  // ao navegar (ou carregar/atualizar a página), abre automaticamente só a
  // seção onde a página atual está — clicar em outro menu troca pra ele e
  // fecha o anterior; só o botão Home força tudo fechado de propósito
  useEffect(() => {
    if (ignorarProximaAutoAbertura.current) {
      ignorarProximaAutoAbertura.current = false;
      return;
    }
    setSecaoAberta(secaoDaRota(pathname));
  }, [pathname]);

  if (!usuario) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas text-muted text-sm">
        Carregando…
      </div>
    );
  }

  const largura = recolhido ? "w-[72px]" : "w-64";
  const itensConfig = navConfiguracoes(usuario.cargo);
  const todosItens = [...NAV_OPERACAO, ...NAV_DASHBOARD, ...itensConfig];
  const tituloAtual =
    todosItens.find((i) => i.href === pathname)?.label ||
    (pathname === "/operacao" ? "Operação" : pathname === "/configuracoes" ? "Configurações" : "");

  function irParaInicio() {
    ignorarProximaAutoAbertura.current = true;
    setSecaoAberta(null);
    router.push("/dashboard/valores-diario");
  }

  return (
    <div className="min-h-screen flex bg-canvas">
      <aside className={`${largura} shrink-0 bg-sidebar border-r border-line text-ink flex flex-col sticky top-0 h-screen transition-all duration-200 print:hidden`}>
        <div className={`${recolhido ? "px-3 py-4 flex justify-center" : "px-4 py-3"} border-b border-line`}>
          <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo Eletrônica" className={recolhido ? "h-10 w-auto" : "w-full h-auto"} />
        </div>

        <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-y-auto">
          <SecaoNav
            titulo="Operação"
            hrefHub="/operacao"
            icone={Briefcase}
            corSecao={CORES_SECAO.operacao}
            itens={NAV_OPERACAO}
            pathname={pathname}
            recolhido={recolhido}
            aberta={secaoAberta === "operacao"}
            onToggle={() => setSecaoAberta((s) => (s === "operacao" ? null : "operacao"))}
            aoClicarNome={() => setSecaoAberta("operacao")}
          />

          <SecaoNav
            titulo="Dashboard"
            hrefHub="/dashboard"
            icone={DollarSign}
            corSecao={CORES_SECAO.dashboard}
            itens={NAV_DASHBOARD}
            pathname={pathname}
            recolhido={recolhido}
            aberta={secaoAberta === "dashboard"}
            onToggle={() => setSecaoAberta((s) => (s === "dashboard" ? null : "dashboard"))}
            aoClicarNome={() => setSecaoAberta("dashboard")}
          />

          {temAcessoConfiguracoes(usuario.cargo) && (
            <SecaoNav
              titulo="Configurações"
              hrefHub="/configuracoes"
              icone={Settings}
              corSecao={CORES_SECAO.configuracoes}
              itens={itensConfig}
              pathname={pathname}
              recolhido={recolhido}
              aberta={secaoAberta === "configuracoes"}
              onToggle={() => setSecaoAberta((s) => (s === "configuracoes" ? null : "configuracoes"))}
              aoClicarNome={() => setSecaoAberta("configuracoes")}
            />
          )}

          <div>
            {!recolhido && <p className="px-3 text-[11px] uppercase tracking-wider font-bold mb-2" style={{ color: "#1B3A5C" }}>Painel</p>}
            {usuario.linha !== "ih" && (
              <a
                href="/painel"
                target="_blank"
                rel="noopener noreferrer"
                title={recolhido ? "Abrir painel de TV" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-ink/5 hover:text-ink transition ${recolhido ? "justify-center" : ""}`}
              >
                <IconeSelo icone={Tv} cor={CORES_SECAO.painel} />
                {!recolhido && "Abrir painel de TV"}
              </a>
            )}
            {(usuario.linha === "ih" || podeAlternarLinha) && (
              <a
                href="/painel/ih"
                target="_blank"
                rel="noopener noreferrer"
                title={recolhido ? "Abrir painel de TV — IH" : undefined}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-ink/5 hover:text-ink transition ${recolhido ? "justify-center" : ""}`}
              >
                <IconeSelo icone={Tv} cor="#B8862E" />
                {!recolhido && (usuario.linha === "ih" ? "Abrir painel de TV" : "Painel de TV — IH")}
              </a>
            )}
          </div>
        </nav>

        <div className="px-2.5 py-4 border-t border-line">
          <button
            onClick={sair}
            title={recolhido ? "Sair" : undefined}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted hover:bg-ink/5 hover:text-ink transition ${recolhido ? "justify-center" : ""}`}
          >
            <LogOut size={16} strokeWidth={2} className="shrink-0" />
            {!recolhido && "Sair"}
          </button>
          <button
            onClick={() => setRecolhido((r) => !r)}
            className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted/70 hover:bg-ink/5 hover:text-ink transition mt-0.5 ${recolhido ? "justify-center" : ""}`}
          >
            {recolhido ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            {!recolhido && "Recolher menu"}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="h-14 border-b border-line bg-panel/95 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-10 print:hidden">
          <div className="flex items-center gap-3">
            <button onClick={irParaInicio} title="Ir para o início" className="text-muted hover:text-gold transition">
              <Home size={17} />
            </button>
            <div className="w-px h-5 bg-line" />
            <p className="text-sm font-medium text-ink">{tituloAtual}</p>
          </div>
          <div className="flex items-center gap-4">
            <BotaoLinhaToggle />
            <BotaoFiltroMarca />
            <BotaoUsuariosOnline />
            <BotaoAvisoAdmin />
            <BotaoMural />
            <div className="text-right">
              <p className="text-sm font-medium text-ink leading-tight">{usuario.nome_completo}</p>
              <p className="text-xs text-muted leading-tight">{rotuloCargo(usuario.cargo)}</p>
            </div>
            <div className="w-px h-8 bg-line" />
            <SinoSolicitacoesSenha usuario={usuario} />
            <BotaoModoClaroEscuro topbar />
          </div>
        </header>
        <main className="p-6 max-w-full overflow-x-hidden">{children}</main>
      </div>
      <BalaoNotificacoes />
    </div>
  );
}

export default function AppShell({ children }) {
  return (
    <SessaoProvider>
      <Shell>{children}</Shell>
    </SessaoProvider>
  );
}
