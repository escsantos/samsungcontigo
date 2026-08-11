"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search, Contact, ClipboardList, ShoppingCart, Bell, UploadCloud, Percent, Users, ChevronRight, Warehouse, FileBarChart, LayoutDashboard
} from "lucide-react";
import { getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";

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
    cargos: ["Administrador", "Diretor", "Gerente", "Vendedor"]
  },
  {
    href: "/clientes",
    label: "Clientes",
    icone: Contact,
    cor: "#8B5CF6",
    descricao: "Cadastre e gerencie os clientes da loja.",
    cargos: ["Administrador", "Diretor", "Gerente", "Vendedor"]
  },
  {
    href: "/orcamentos",
    label: "Orçamentos",
    icone: ClipboardList,
    cor: "#3FA796",
    descricao: "Acompanhe pedidos e revise carrinhos enviados pelos clientes.",
    cargos: ["Administrador", "Diretor", "Gerente", "Vendedor", "Cliente"]
  },
  {
    href: "/carrinho",
    label: "Carrinho",
    icone: ShoppingCart,
    cor: "#E8A33D",
    descricao: "Veja os itens já separados antes de confirmar um pedido.",
    cargos: ["Administrador", "Diretor", "Gerente", "Vendedor", "Cliente"]
  },
  {
    href: "/estoque",
    label: "Estoque",
    icone: Warehouse,
    cor: "#2E7F97",
    descricao: "Acompanhe a linha do tempo dos pedidos e libere peças por Delivery.",
    cargos: ["Administrador", "Diretor", "Gerente", "Estoque"]
  },
  {
    href: "/notificacoes",
    label: "Notificações",
    icone: Bell,
    cor: "#E1614F",
    descricao: "Avisos do sistema, como solicitações de redefinição de senha.",
    cargos: ["Administrador", "Diretor", "Gerente"]
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
    cargos: ["Administrador", "Diretor", "Gerente"]
  },
  {
    href: "/estoque/relatorio",
    label: "Relatório de Custo",
    icone: FileBarChart,
    cor: "#4338CA",
    descricao: "Custo real, imposto e lucro líquido das peças já liberadas.",
    cargos: ["Administrador", "Diretor", "Gerente"]
  }
];

export default function InicioPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  if (perfil === undefined) {
    return <AppShell titulo="Início"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  const opcoes = CARDS.filter((item) => !item.cargos || item.cargos.includes(perfil?.cargo));

  return (
    <AppShell titulo="Início">
      <p className="text-sm text-muted mb-5">
        Olá, <b>{perfil?.nome}</b>. Aqui estão as áreas que você pode acessar.
      </p>
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
    </AppShell>
  );
}
