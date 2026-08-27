"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Contact, ClipboardList, ShoppingCart, Bell, UploadCloud, Percent, Users, ChevronRight, Warehouse, FileBarChart, LayoutDashboard, Smartphone, Copy, Check, FileCheck2, BarChart3
} from "lucide-react";
import { getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import { CARGOS_FISCAL } from "../../lib/fiscal";
import { CARGOS_RELATORIOS } from "../../lib/relatorios";

const CARDS = [
  {
    href: "/pecas",
    label: "Consulta de Peças",
    icone: Search,
    cor: "#4A90D9",
    descricao: "Busque peças por código, modelo ou descrição e veja custo e preço de venda.",
    cargos: null
  },
  {
    href: "/dashboard",
    label: "Dashboard de Vendas",
    icone: LayoutDashboard,
    cor: "#3FA796",
    descricao: "Cards, gráficos e ranking de vendas por período.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"]
  },
  {
    href: "/clientes",
    label: "Clientes",
    icone: Contact,
    cor: "#8B5CF6",
    descricao: "Cadastre e gerencie os clientes da loja.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"]
  },
  {
    href: "/orcamentos",
    label: "Orçamentos",
    icone: ClipboardList,
    cor: "#3FA796",
    descricao: "Acompanhe pedidos e revise carrinhos enviados pelos clientes.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor", "Cliente"]
  },
  {
    href: "/carrinho",
    label: "Carrinho",
    icone: ShoppingCart,
    cor: "#E8A33D",
    descricao: "Veja os itens já separados antes de confirmar um pedido.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor", "Cliente"]
  },
  {
    href: "/estoque",
    label: "Estoque",
    icone: Warehouse,
    cor: "#2E7F97",
    descricao: "Acompanhe a linha do tempo dos pedidos e libere peças por Delivery.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"]
  },
  {
    href: "/notificacoes",
    label: "Notificações",
    icone: Bell,
    cor: "#E1614F",
    descricao: "Avisos do sistema, como solicitações de redefinição de senha.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"]
  },
  {
    href: "/configuracoes/carregar-bases",
    label: "Carregar Bases",
    icone: UploadCloud,
    cor: "#2E6DA8",
    descricao: "Suba as planilhas de peças e ordens de serviço para atualizar a base.",
    cargos: ["Administrador"]
  },
  {
    href: "/configuracoes/impostos",
    label: "Impostos",
    icone: Percent,
    cor: "#C2801F",
    descricao: "Cadastre os impostos usados no cálculo do preço de venda.",
    cargos: ["Administrador"]
  },
  {
    href: "/configuracoes/usuarios",
    label: "Usuários",
    icone: Users,
    cor: "#7A4FB0",
    descricao: "Crie logins, defina cargos e controle o acesso ao sistema.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"]
  },
  {
    href: "/estoque/relatorio",
    label: "Relatório de Custo",
    icone: FileBarChart,
    cor: "#4338CA",
    descricao: "Custo real, imposto e lucro líquido das peças já liberadas.",
    cargos: ["Administrador", "Diretor", "Gerente", "Supervisor"]
  },
  {
    href: "/fiscal",
    label: "Fiscal",
    icone: FileCheck2,
    cor: "#4338CA",
    descricao: "Notas fiscais emitidas e pedidos liberados aguardando emissão.",
    cargos: CARGOS_FISCAL
  },
  {
    href: "/relatorios/resumo",
    label: "Relatórios",
    icone: BarChart3,
    cor: "#7A4FB0",
    descricao: "Margem e comissão por pedido entregue, mensal ou semanal.",
    cargos: CARGOS_RELATORIOS
  }
];

export default function InicioPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [qrAberto, setQrAberto] = useState(false);
  const [urlAtual, setUrlAtual] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
    if (typeof window !== "undefined") setUrlAtual(window.location.origin);
  }, []);

  function copiarLink() {
    navigator.clipboard.writeText(urlAtual);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Início"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  const opcoes = CARDS.filter((item) => !item.cargos || item.cargos.includes(perfil?.cargo));

  return (
    <AppShell titulo="Início">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <p className="text-sm text-muted">
          Olá, <b>{perfil?.nome}</b>. Aqui estão as áreas que você pode acessar.
        </p>
        <button className="btn-secondary text-xs py-2" onClick={() => setQrAberto(true)}>
          <Smartphone size={14} />
          Acessar no celular
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {opcoes.map((item) => {
          const Icone = item.icone;
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              className="card p-5 text-left hover:-translate-y-0.5 transition group"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: `${item.cor}22`, color: item.cor }}
              >
                <Icone size={20} />
              </div>
              <div className="flex items-center gap-1.5">
                <p className="font-display font-semibold text-[15px]">{item.label}</p>
                <ChevronRight size={15} className="text-muted group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-xs text-muted mt-1.5 leading-relaxed">{item.descricao}</p>
            </button>
          );
        })}
      </div>

      <Modal open={qrAberto} onClose={() => setQrAberto(false)} title="Acessar no celular">
        <div className="text-center">
          <p className="text-sm text-muted mb-4">Aponte a câmera do celular pra esse código pra abrir o sistema direto nele.</p>
          {urlAtual && (
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(urlAtual)}`}
              alt="QR Code de acesso"
              className="mx-auto rounded-lg border border-line"
              width={220}
              height={220}
            />
          )}
          <div className="flex items-center gap-2 mt-4 bg-canvas rounded-lg px-3 py-2.5">
            <span className="text-xs font-mono flex-1 text-left truncate">{urlAtual}</span>
            <button onClick={copiarLink} className="shrink-0 text-muted hover:text-ink">
              {copiado ? <Check size={15} style={{ color: "#2C7C6E" }} /> : <Copy size={15} />}
            </button>
          </div>
          <p className="text-[11px] text-muted mt-3">
            Depois de acessar, o celular pode oferecer a opção "Adicionar à tela inicial" — isso deixa o sistema com cara de aplicativo, com ícone próprio.
          </p>
        </div>
      </Modal>
    </AppShell>
  );
}
