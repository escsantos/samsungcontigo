"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, UploadCloud, LogOut, Home, Settings, Users, Bell, Percent, Contact,
  ShoppingCart, ClipboardList, Warehouse, FileBarChart, Briefcase, ChevronDown, LayoutDashboard, Menu, X, Receipt,
  Wallet, ClipboardCheck, Truck, Building2, Database, RotateCcw, ScrollText, FileCheck2, BarChart3, HandCoins, PackageOpen,
  ShoppingBag, AlertTriangle, Sparkles
} from "lucide-react";
import { supabase, getPerfilAtual } from "../lib/supabaseClient";
import { getUnidadeAtiva, setUnidadeAtiva, buscarUnidadesDoUsuario, limparUnidadeAtiva } from "../lib/unidade";
import { registrarAuditoria } from "../lib/auditoria";
import { CARGOS_FISCAL, STATUS_POS_LIBERACAO, STATUS_LIBERADO } from "../lib/fiscal";
import { CARGOS_RELATORIOS, CARGOS_COMISSOES, CARGOS_VISAO_360 } from "../lib/relatorios";
import { ORDEM_STATUS } from "../lib/estoque";
import BotaoTema from "./BotaoTema";
import SeletorCor, { aplicarAccent } from "./SeletorCor";
import SeletorTema, { aplicarTemaVisual } from "./SeletorTema";
import Avatar from "./Avatar";
import SininhoNotificacoes from "./SininhoNotificacoes";
import IndicadorOnline from "./IndicadorOnline";
import Modal from "./Modal";
import { useCarrinho } from "../contexts/CarrinhoContext";

function fmtBRLAppShell(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Quem vê o balão de "novo pedido" e o de "pendência no estoque" (com bip).
const CARGOS_TOAST_PEDIDO = ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor", "Estoque", "Financeiro"];
const CARGOS_TOAST_ESTOQUE = ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"];
// Status que representam uma pendência pro time de Estoque (tudo além de
// "Pendente de Análise" — e "Produto Entregue" não conta, já foi concluído).
const STATUS_PENDENCIA_ESTOQUE = ORDEM_STATUS.filter((s) => s !== "Pendente de Análise" && s !== "Produto Entregue");

// Simula "3 bips" (tipo alerta do Windows) com Web Audio — sem depender de
// nenhum arquivo de som. Alguns navegadores só liberam áudio depois de uma
// interação do usuário na página; se isso falhar, o balão ainda aparece normalmente.
function tocarBips() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
      t += 0.28;
    }
    setTimeout(() => ctx.close(), 1500);
  } catch (e) {
    console.error("[bips] falha ao tocar som:", e);
  }
}

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
      { href: "/dashboard", label: "Dashboard de Vendas", icone: LayoutDashboard, cor: "#3FA796", descricao: "Cards, gráficos e ranking de vendas por período.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"] },
      { href: "/clientes", label: "Clientes", icone: Contact, cor: "#8B5CF6", descricao: "Cadastre e gerencie os clientes da loja.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"] },
      { href: "/orcamentos", label: "Orçamentos", icone: ClipboardList, cor: "#4A90D9", descricao: "Acompanhe pedidos e revise carrinhos enviados pelos clientes.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor", "Cliente"] },
      { href: "/pagamentos", label: "Pagamentos", icone: Receipt, cor: "#E1614F", descricao: "Busque um pedido pelo número e registre ou ajuste o pagamento.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor", "Estoque"] }
    ]
  },
  {
    id: "estoque",
    label: "Estoque",
    icone: Warehouse,
    href: "/menu/estoque",
    itens: [
      { href: "/estoque", label: "Painel de Estoque", icone: Warehouse, cor: "#2E7F97", descricao: "Acompanhe a linha do tempo dos pedidos e libere peças por Delivery.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"] },
      { href: "/estoque/pedidos", label: "Relatório de Pedidos", icone: ClipboardList, cor: "#7A4FB0", descricao: "Todos os pedidos com filtros completos, exporta para Excel.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"] },
      { href: "/estoque/relatorio", label: "Relatório de Custo", icone: FileBarChart, cor: "#4338CA", descricao: "Custo real, imposto e lucro líquido das peças já liberadas.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"] }
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
      { href: "/financeiro/estornos", label: "Estornos", icone: RotateCcw, cor: "#9C5A34", descricao: "Processe solicitações de estorno de pedidos cancelados.", cargos: ["Administrador", "Financeiro"] },
      { href: "/financeiro/contas-a-receber", label: "Contas a Receber", icone: HandCoins, cor: "#B0553B", descricao: "Pedidos já entregues com pagamento em aberto — total e parcial.", cargos: ["Administrador", "Financeiro"] }
    ]
  },
  {
    id: "fiscal",
    label: "Fiscal",
    icone: FileCheck2,
    href: "/fiscal",
    itens: [
      { href: "/fiscal", label: "Dashboard Fiscal", icone: FileCheck2, cor: "#4338CA", descricao: "Notas fiscais emitidas e pedidos liberados aguardando emissão.", cargos: CARGOS_FISCAL }
    ]
  },
  {
    id: "relatorios",
    label: "Relatórios",
    icone: BarChart3,
    href: "/relatorios/resumo",
    itens: [
      { href: "/relatorios/resumo", label: "Resumo", icone: BarChart3, cor: "#7A4FB0", descricao: "Margem e comissão por pedido entregue, mensal ou semanal.", cargos: CARGOS_RELATORIOS },
      { href: "/relatorios/comissoes", label: "Comissões", icone: Percent, cor: "#C2801F", descricao: "Ranking e detalhe da comissão de cada vendedor, mensal ou semanal.", cargos: CARGOS_COMISSOES },
      { href: "/relatorios/visao-360", label: "Visão 360º", icone: Sparkles, cor: "#4338CA", descricao: "Painel executivo: KPIs, funil de vendas, ranking gamificado, saúde financeira e feed ao vivo.", cargos: CARGOS_VISAO_360 }
    ]
  },
  {
    id: "sistema",
    label: "Sistema",
    icone: Settings,
    href: "/configuracoes",
    itens: [
      { href: "/notificacoes", label: "Notificações", icone: Bell, cor: "#E1614F", descricao: "Avisos do sistema, como solicitações de redefinição de senha.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"] },
      { href: "/configuracoes/carregar-bases", label: "Carregar Bases", icone: UploadCloud, cor: "#2E6DA8", descricao: "Suba as planilhas de peças e ordens de serviço para atualizar a base.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"] },
      { href: "/configuracoes/impostos", label: "Impostos", icone: Percent, cor: "#C2801F", descricao: "Cadastre os impostos usados no cálculo do preço de venda.", cargos: ["Administrador"] },
      { href: "/configuracoes/usuarios", label: "Usuários", icone: Users, cor: "#7A4FB0", descricao: "Crie logins, defina cargos e controle o acesso ao sistema.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"] },
      { href: "/configuracoes/unidades", label: "Unidades", icone: Building2, cor: "#2C7C6E", descricao: "Cadastre as unidades do grupo e o ASC COD. de cada uma.", cargos: ["Administrador"] },
      { href: "/configuracoes/manutencao", label: "Manutenção", icone: Database, cor: "#E1614F", descricao: "Contagem de registros, backup manual e limpeza de orçamentos por unidade.", cargos: ["Administrador"] },
      { href: "/configuracoes/auditoria", label: "Auditoria", icone: ScrollText, cor: "#2E6DA8", descricao: "Login/logout, alterações de usuário e movimentações do sistema.", cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"] }
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
  const [alertasFiscais, setAlertasFiscais] = useState(0);
  const [avisosRetirada, setAvisosRetirada] = useState([]);
  const [processandoAvisoRetirada, setProcessandoAvisoRetirada] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [temaVisual, setTemaVisual] = useState("original");
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
      aplicarTemaVisual(p?.tema_visual || "original");
      setTemaVisual(p?.tema_visual || "original");
      setCarregando(false);

      if (ativa && CARGOS_FISCAL.includes(p?.cargo)) {
        carregarAlertasFiscais(ativa.id);
      }
      if (ativa && p?.cargo === "Cliente" && p?.cliente_id) {
        carregarAvisosRetirada(ativa.id, p.cliente_id);
      }

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

  function removerToast(toastId) {
    setToasts((atual) => atual.filter((t) => t.id !== toastId));
  }

  function adicionarToast(dados) {
    const toastId = `${Date.now()}-${Math.random()}`;
    setToasts((atual) => [...atual, { id: toastId, ...dados }]);
    setTimeout(() => removerToast(toastId), 15000);
  }

  // Balão de "novo pedido" (assim que alguém cria um orçamento) e de
  // "pendência no estoque" (com 3 bips) quando um pedido muda pra algum
  // status que o time de Estoque precisa tratar. Via Realtime do Supabase,
  // sempre da unidade ativa.
  useEffect(() => {
    if (!unidadeAtiva?.id || !perfil?.cargo || perfil.cargo === "Cliente") return;
    const vePedido = CARGOS_TOAST_PEDIDO.includes(perfil.cargo);
    const vePendenciaEstoque = CARGOS_TOAST_ESTOQUE.includes(perfil.cargo);
    if (!vePedido && !vePendenciaEstoque) return;

    const canal = supabase
      .channel(`orcamentos-toasts-${unidadeAtiva.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orcamentos", filter: `unidade_id=eq.${unidadeAtiva.id}` },
        async (payload) => {
          if (!vePedido) return;
          const o = payload.new;
          const [{ data: cliente }, { data: vendedor }] = await Promise.all([
            supabase.from("clientes").select("nome").eq("id", o.cliente_id).maybeSingle(),
            o.vendedor_id
              ? supabase.from("perfis").select("nome").eq("id", o.vendedor_id).maybeSingle()
              : Promise.resolve({ data: null })
          ]);
          adicionarToast({
            tipo: "novo_pedido",
            titulo: `Novo pedido #${o.numero_unidade}`,
            linhas: [
              `Cliente: ${cliente?.nome || "—"}`,
              `Vendedor: ${vendedor?.nome || "—"}`,
              `Valor: ${fmtBRLAppShell(o.valor_total)}`
            ]
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orcamentos", filter: `unidade_id=eq.${unidadeAtiva.id}` },
        (payload) => {
          if (!vePendenciaEstoque) return;
          const antes = payload.old;
          const depois = payload.new;
          if (antes?.status !== depois.status && STATUS_PENDENCIA_ESTOQUE.includes(depois.status)) {
            adicionarToast({
              tipo: "pendencia_estoque",
              titulo: `Pedido #${depois.numero_unidade}`,
              linhas: [`Nova pendência no Estoque: ${depois.status}`]
            });
            tocarBips();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [unidadeAtiva?.id, perfil?.cargo]);

  async function carregarAlertasFiscais(unidadeId) {
    try {
      const { data: u } = await supabase.from("unidades").select("obriga_nota_fiscal").eq("id", unidadeId).single();
      if (!u?.obriga_nota_fiscal) {
        setAlertasFiscais(0);
        return;
      }
      const { count } = await supabase
        .from("orcamentos")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId)
        .in("status", STATUS_POS_LIBERACAO)
        .is("nota_fiscal_numero", null);
      setAlertasFiscais(count || 0);
    } catch (e) {
      console.error("[alertas fiscais] falha ao carregar:", e);
    }
  }

  // Pop-up no próximo acesso do cliente: pedidos liberados pra retirada que
  // ele ainda não confirmou ter visto.
  async function carregarAvisosRetirada(unidadeId, clienteId) {
    try {
      const { data } = await supabase
        .from("orcamentos")
        .select("id, numero_unidade, valor_total")
        .eq("unidade_id", unidadeId)
        .eq("cliente_id", clienteId)
        .eq("status", STATUS_LIBERADO)
        .eq("entregue", false)
        .eq("aviso_retirada_visto", false)
        .order("criado_em");
      setAvisosRetirada(data || []);
    } catch (e) {
      console.error("[avisos de retirada] falha ao carregar:", e);
    }
  }

  async function fecharAvisosRetirada() {
    if (avisosRetirada.length === 0) return;
    setProcessandoAvisoRetirada(true);
    await supabase
      .from("orcamentos")
      .update({ aviso_retirada_visto: true })
      .in("id", avisosRetirada.map((o) => o.id));
    setProcessandoAvisoRetirada(false);
    setAvisosRetirada([]);
  }

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

  const podeComprar = ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor", "Cliente"].includes(perfil?.cargo);

  return (
    <div className="h-screen flex bg-canvas">
      {menuMobileAberto && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMenuMobileAberto(false)} />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-64 md:w-60 shrink-0 flex flex-col text-white no-print transform transition-transform duration-200 ${
          menuMobileAberto ? "translate-x-0" : "-translate-x-full"
        } md:translate-x-0`}
        style={{ background: "var(--sidebar-grad, linear-gradient(180deg, var(--accent-dark), var(--accent)))" }}
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
                  {grupo.id === "fiscal" && alertasFiscais > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                      {alertasFiscais > 9 ? "9+" : alertasFiscais}
                    </span>
                  )}
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
            <SininhoNotificacoes visivel={["Administrador", "Diretor", "Gerente", "Supervisor"].includes(perfil?.cargo)} />
            <h1 className="font-display font-semibold text-[15px] text-ink truncate">{titulo}</h1>
            {unidadeAtiva && (
              <button
                onClick={() => unidadesDoUsuario.length > 1 && router.push("/selecionar-unidade?trocar=1")}
                title={unidadesDoUsuario.length > 1 ? "Clique pra trocar de unidade" : unidadeAtiva.nome}
                className="hidden sm:flex items-center gap-2 font-display font-bold uppercase text-sm md:text-base px-3.5 py-1.5 rounded-xl shrink-0 tracking-wide"
                style={{
                  background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 100%, white 12%) 0%, var(--accent) 55%, color-mix(in srgb, var(--accent) 100%, black 25%) 100%)",
                  color: "#fff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.35) inset, 0 -2px 3px rgba(0,0,0,0.18) inset",
                  cursor: unidadesDoUsuario.length > 1 ? "pointer" : "default"
                }}
              >
                <Building2 size={16} className="shrink-0" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.35))" }} />
                {unidadeAtiva.nome}
                {unidadesDoUsuario.length > 1 && <ChevronDown size={14} className="shrink-0" />}
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
                    {carrinho.totalItens}
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
              <SeletorTema perfil={perfil} onChange={setTemaVisual} />
              <span
                className={temaVisual !== "original" ? "opacity-40 pointer-events-none" : ""}
                title={temaVisual !== "original" ? "Indisponível com um tema especial ativo" : undefined}
              >
                <SeletorCor perfil={perfil} />
              </span>
              <span
                className={temaVisual !== "original" ? "opacity-40 pointer-events-none" : ""}
                title={temaVisual !== "original" ? "Indisponível com um tema especial ativo" : undefined}
              >
                <BotaoTema />
              </span>
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-3 md:p-6">{children}</main>
      </div>

      <Modal
        open={avisosRetirada.length > 0}
        onClose={fecharAvisosRetirada}
        title="Seu pedido está pronto!"
        footer={
          <button className="btn-primary" disabled={processandoAvisoRetirada} onClick={fecharAvisosRetirada}>
            Ok, entendi
          </button>
        }
      >
        <p className="text-sm text-muted mb-3">
          {avisosRetirada.length === 1
            ? "Você tem 1 pedido liberado, pronto para retirada:"
            : `Você tem ${avisosRetirada.length} pedidos liberados, prontos para retirada:`}
        </p>
        <div className="space-y-2">
          {avisosRetirada.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2" style={{ background: "rgba(63,167,150,0.10)" }}>
              <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "#2C7C6E" }}>
                <PackageOpen size={15} />
                Pedido #{o.numero_unidade}
              </span>
              <span className="font-mono text-xs text-muted">{fmtBRLAppShell(o.valor_total)}</span>
            </div>
          ))}
        </div>
      </Modal>

      <div className="fixed bottom-4 left-4 z-[60] w-80 max-w-[90vw] space-y-2 no-print">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="card p-3.5 shadow-2xl border-l-4"
            style={{ borderLeftColor: t.tipo === "pendencia_estoque" ? "#C2801F" : "#2C7C6E" }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="flex items-center gap-2">
                {t.tipo === "pendencia_estoque" ? (
                  <AlertTriangle size={15} style={{ color: "#C2801F" }} />
                ) : (
                  <ShoppingBag size={15} style={{ color: "#2C7C6E" }} />
                )}
                <p className="text-sm font-semibold">{t.titulo}</p>
              </span>
              <button onClick={() => removerToast(t.id)} className="text-muted hover:text-ink shrink-0" aria-label="Fechar aviso">
                <X size={14} />
              </button>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {t.linhas.map((l, i) => (
                <p key={i} className="text-xs text-muted">{l}</p>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Decoração do tema visual escolhido — puramente visual, não recebe cliques. */}
      {temaVisual === "dos" && <div className="tema-decoracao tema-scanlines no-print" aria-hidden="true" />}
      {temaVisual === "criancas" && (
        <div className="tema-decoracao tema-confetti no-print" aria-hidden="true">
          <span style={{ top: "6%", left: "4%", animationDelay: "0s" }}>🎈</span>
          <span style={{ top: "18%", right: "6%", animationDelay: "1.2s" }}>🧸</span>
          <span style={{ top: "48%", left: "2%", animationDelay: "0.6s" }}>🪁</span>
          <span style={{ bottom: "10%", right: "4%", animationDelay: "2s" }}>🎨</span>
          <span style={{ bottom: "22%", left: "6%", animationDelay: "1.6s" }}>⭐</span>
        </div>
      )}
      {temaVisual === "natal" && (
        <div className="tema-decoracao tema-neve no-print" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, i) => (
            <span
              key={i}
              style={{
                left: `${(i * 97) % 100}%`,
                fontSize: `${8 + ((i * 13) % 12)}px`,
                animationDuration: `${6 + ((i * 7) % 8)}s`,
                animationDelay: `-${(i * 3) % 10}s`
              }}
            >
              ❄
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
