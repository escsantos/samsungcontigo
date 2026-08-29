"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, ShieldAlert, Calendar, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet,
  ClipboardList, Percent, PiggyBank, Filter, AlertTriangle, FileCheck2, Receipt, RotateCcw, Timer,
  Trophy, Award, Medal, Gem, Package, Contact, Radio, History, Warehouse, HandCoins,
  LogIn, LogOut, Plus, Pencil, Trash2, Lock, Unlock, KeyRound, ArrowRightLeft
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import CardStat from "../../../components/CardStat";
import Avatar from "../../../components/Avatar";
import { getUnidadeAtiva } from "../../../lib/unidade";
import { STATUS_POS_LIBERACAO } from "../../../lib/fiscal";
import { ORDEM_STATUS } from "../../../lib/estoque";
import {
  CARGOS_VISAO_360,
  inicioSemana,
  fimSemana,
  rotuloSemana,
  calcularLinhaResumo
} from "../../../lib/relatorios";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBRLCompacto(v) {
  if (!v) return "R$ 0";
  if (Math.abs(v) >= 1000) return "R$ " + (v / 1000).toFixed(1).replace(".", ",") + "k";
  return fmtBRL(v);
}
function fmtPct(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}
function fmtData(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}
function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}
function mesAtualStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];
const NOMES_MES_ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const CORES_POSICAO = ["#E8A33D", "#8B93A1", "#B0703A"]; // ouro, prata, bronze
const ICONES_POSICAO = [Trophy, Award, Medal];

// Faixas de reconhecimento do vendedor, pelo valor vendido (entregue) no período.
const TIERS = [
  { nome: "Bronze", min: 0, cor: "#9C6B4F", icone: Medal },
  { nome: "Prata", min: 15000, cor: "#8B93A1", icone: Award },
  { nome: "Ouro", min: 35000, cor: "#E8A33D", icone: Trophy },
  { nome: "Diamante", min: 70000, cor: "#4FADCE", icone: Gem }
];
function tierDoVendedor(valorVendido) {
  let atual = TIERS[0];
  for (const t of TIERS) if (valorVendido >= t.min) atual = t;
  const idx = TIERS.indexOf(atual);
  const proximo = TIERS[idx + 1] || null;
  const progresso = proximo ? Math.min(100, Math.max(4, ((valorVendido - atual.min) / (proximo.min - atual.min)) * 100)) : 100;
  return { atual, proximo, progresso };
}

// Mesmo mapeamento de ícone/cor por tipo de evento usado em Configurações > Auditoria.
const ICONE_TIPO_FEED = {
  login: LogIn, logout: LogOut, criacao: Plus, edicao: Pencil, exclusao: Trash2,
  status: ArrowRightLeft, bloqueio: Lock, desbloqueio: Unlock, senha: KeyRound, pagamento: Receipt
};
const COR_TIPO_FEED = {
  login: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  logout: { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" },
  criacao: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  edicao: { bg: "rgba(46,109,168,0.14)", fg: "#2E6DA8" },
  exclusao: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  status: { bg: "rgba(99,102,241,0.14)", fg: "#4338CA" },
  bloqueio: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  desbloqueio: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  senha: { bg: "rgba(232,163,61,0.14)", fg: "#C2801F" },
  pagamento: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" }
};

// Etapas do funil de vendas, na ordem — cada uma é um subconjunto cumulativo
// da anterior (todo "Entregue" também é "Liberado", também é "Faturado"...).
const ETAPAS_FUNIL = [
  { label: "Pedidos Recebidos", cor: "#4A90D9", teste: () => true },
  { label: "Aprovados", cor: "#7A4FB0", teste: (s) => !["Pendente de Análise", "Rejeitado", "Cancelado"].includes(s) },
  { label: "Faturados", cor: "#4338CA", teste: (s) => ["Faturamento Efetuado", "Liberado para Retirada/Entrega", "Produto Entregue"].includes(s) },
  { label: "Liberados", cor: "#2E7F97", teste: (s) => ["Liberado para Retirada/Entrega", "Produto Entregue"].includes(s) },
  { label: "Entregues", cor: "#2C7C6E", teste: (s) => s === "Produto Entregue" }
];

// Pedidos parados: qualquer status além da triagem/rejeição/cancelamento.
const STATUS_PENDENCIA_ESTOQUE = ORDEM_STATUS.filter((s) => s !== "Pendente de Análise" && s !== "Produto Entregue");

export default function Visao360Page() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [unidadeAtiva, setUnidadeAtivaLocal] = useState(null);
  const [unidadeInfo, setUnidadeInfo] = useState(null);

  const [tipoPeriodo, setTipoPeriodo] = useState("mensal"); // "mensal" | "semanal"
  const [mesSelecionado, setMesSelecionado] = useState(mesAtualStr());
  const [semanaRef, setSemanaRef] = useState(() => new Date());

  const [pedidosCriados, setPedidosCriados] = useState([]);
  const [pedidosEntregues, setPedidosEntregues] = useState([]);
  const [itens, setItens] = useState([]);
  const [cicloAnterior, setCicloAnterior] = useState([]);
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(true);

  const [fiscalPendentes, setFiscalPendentes] = useState([]);
  const [pendenciasEstoque, setPendenciasEstoque] = useState(0);
  const [pedidosParados, setPedidosParados] = useState(0);
  const [estornosPendentes, setEstornosPendentes] = useState(0);
  const [pagamentoAberto, setPagamentoAberto] = useState({ qtd: 0, soma: 0 });
  const [carregandoAlertas, setCarregandoAlertas] = useState(true);

  const [saudeFinanceira, setSaudeFinanceira] = useState([]);
  const [carregandoSaude, setCarregandoSaude] = useState(true);

  const [feed, setFeed] = useState([]);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
    setUnidadeAtivaLocal(getUnidadeAtiva());
  }, []);

  const periodo = useMemo(() => {
    if (tipoPeriodo === "semanal") {
      return { de: inicioSemana(semanaRef), ate: fimSemana(semanaRef) };
    }
    const [ano, mes] = mesSelecionado.split("-").map(Number);
    if (!ano || !mes) return null;
    const de = new Date(ano, mes - 1, 1, 0, 0, 0, 0);
    const ate = new Date(ano, mes, 0, 23, 59, 59, 999);
    return { de, ate };
  }, [tipoPeriodo, mesSelecionado, semanaRef]);

  // Dados que dependem do período escolhido: KPIs, funil, ranking, top clientes/peças, ciclo médio.
  useEffect(() => {
    if (perfil === undefined || !unidadeAtiva?.id) return;
    if (!CARGOS_VISAO_360.includes(perfil?.cargo) || !periodo) { setCarregandoPeriodo(false); return; }
    (async () => {
      setCarregandoPeriodo(true);

      const { data: criados } = await supabase
        .from("orcamentos")
        .select("id, status, valor_total, criado_em")
        .eq("unidade_id", unidadeAtiva.id)
        .gte("criado_em", periodo.de.toISOString())
        .lte("criado_em", periodo.ate.toISOString());
      setPedidosCriados(criados || []);

      const { data: entregues } = await supabase
        .from("orcamentos")
        .select("id, numero_unidade, valor_total, imposto_total, nota_fiscal_numero, vendedor_id, criado_em, entregue_em, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome, foto_url, comissao_percentual)")
        .eq("unidade_id", unidadeAtiva.id)
        .eq("entregue", true)
        .gte("entregue_em", periodo.de.toISOString())
        .lte("entregue_em", periodo.ate.toISOString())
        .order("entregue_em", { ascending: false });
      setPedidosEntregues(entregues || []);

      const ids = (entregues || []).map((o) => o.id);
      if (ids.length > 0) {
        const { data: itensData } = await supabase
          .from("orcamento_itens")
          .select("orcamento_id, codigo, descricao_resumida, categoria, qtd, custo_real, venda_total")
          .in("orcamento_id", ids);
        setItens(itensData || []);
      } else {
        setItens([]);
      }

      // Mesma duração, período imediatamente anterior — só pra comparar o ciclo médio.
      const duracaoMs = periodo.ate.getTime() - periodo.de.getTime();
      const anteriorAte = new Date(periodo.de.getTime() - 1);
      const anteriorDe = new Date(periodo.de.getTime() - duracaoMs - 1);
      const { data: entreguesAnt } = await supabase
        .from("orcamentos")
        .select("criado_em, entregue_em")
        .eq("unidade_id", unidadeAtiva.id)
        .eq("entregue", true)
        .gte("entregue_em", anteriorDe.toISOString())
        .lte("entregue_em", anteriorAte.toISOString());
      setCicloAnterior(entreguesAnt || []);

      setCarregandoPeriodo(false);
    })();
  }, [perfil, unidadeAtiva, periodo]);

  // Central de alertas, saúde financeira (últimos 6 meses) e feed ao vivo — não dependem
  // do período escolhido, são sempre o retrato atual da unidade.
  useEffect(() => {
    if (perfil === undefined || !unidadeAtiva?.id) return;
    if (!CARGOS_VISAO_360.includes(perfil?.cargo)) return;

    carregarAlertas(unidadeAtiva.id);
    carregarSaudeFinanceira(unidadeAtiva.id);
    carregarFeed(unidadeAtiva.id);

    const canal = supabase
      .channel(`visao360-feed-${unidadeAtiva.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "auditoria_logs", filter: `unidade_id=eq.${unidadeAtiva.id}` },
        async (payload) => {
          const log = payload.new;
          let nome = "Sistema";
          if (log.usuario_id) {
            const { data: p } = await supabase.from("perfis").select("nome").eq("id", log.usuario_id).maybeSingle();
            nome = p?.nome || "Sistema";
          }
          setFeed((atual) => [{ ...log, perfis: { nome } }, ...atual].slice(0, 30));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, unidadeAtiva?.id]);

  async function carregarAlertas(unidadeId) {
    setCarregandoAlertas(true);
    try {
      const { data: u } = await supabase.from("unidades").select("nome, obriga_nota_fiscal").eq("id", unidadeId).single();
      setUnidadeInfo(u || null);

      if (u?.obriga_nota_fiscal) {
        const { data } = await supabase
          .from("orcamentos")
          .select("id, numero_unidade, valor_total, criado_em, clientes(nome)")
          .eq("unidade_id", unidadeId)
          .in("status", STATUS_POS_LIBERACAO)
          .is("nota_fiscal_numero", null)
          .order("criado_em", { ascending: true });
        setFiscalPendentes(data || []);
      } else {
        setFiscalPendentes([]);
      }

      const { count: countEstoque } = await supabase
        .from("orcamentos")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId)
        .in("status", STATUS_PENDENCIA_ESTOQUE);
      setPendenciasEstoque(countEstoque || 0);

      const cincoDiasAtras = new Date(Date.now() - 5 * 86400000).toISOString();
      const { data: candidatosParados } = await supabase
        .from("orcamentos")
        .select("id, status")
        .eq("unidade_id", unidadeId)
        .eq("entregue", false)
        .lte("criado_em", cincoDiasAtras);
      const qtdParados = (candidatosParados || []).filter((o) => !["Pendente de Análise", "Rejeitado", "Cancelado"].includes(o.status)).length;
      setPedidosParados(qtdParados);

      const { count: countEstornos } = await supabase
        .from("estornos")
        .select("id", { count: "exact", head: true })
        .eq("unidade_id", unidadeId)
        .eq("status", "Pendente");
      setEstornosPendentes(countEstornos || 0);

      const { data: entreguesTodos } = await supabase
        .from("orcamentos")
        .select("id, valor_total, valor_herdado_pai")
        .eq("unidade_id", unidadeId)
        .eq("entregue", true);
      const idsEnt = (entreguesTodos || []).map((o) => o.id);
      const pagoPorPedido = {};
      if (idsEnt.length > 0) {
        const { data: pagamentos } = await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsEnt);
        (pagamentos || []).forEach((p) => {
          pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
        });
      }
      let qtdAberto = 0, somaAberto = 0;
      (entreguesTodos || []).forEach((o) => {
        const pago = (pagoPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0);
        const aberto = Number(o.valor_total || 0) - pago;
        if (aberto > 0.01) { qtdAberto++; somaAberto += aberto; }
      });
      setPagamentoAberto({ qtd: qtdAberto, soma: somaAberto });
    } catch (e) {
      console.error("[visão 360 - alertas] falha ao carregar:", e);
    }
    setCarregandoAlertas(false);
  }

  async function carregarSaudeFinanceira(unidadeId) {
    setCarregandoSaude(true);
    try {
      const hoje = new Date();
      const inicio6m = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1, 0, 0, 0, 0);
      const { data: pedidos } = await supabase
        .from("orcamentos")
        .select("id, valor_total, imposto_total, entregue_em, perfis!orcamentos_vendedor_id_fkey(comissao_percentual)")
        .eq("unidade_id", unidadeId)
        .eq("entregue", true)
        .gte("entregue_em", inicio6m.toISOString());
      const lista = pedidos || [];

      const ids = lista.map((o) => o.id);
      const custoPorPedido = {};
      if (ids.length > 0) {
        const { data: itensData } = await supabase.from("orcamento_itens").select("orcamento_id, qtd, custo_real").in("orcamento_id", ids);
        (itensData || []).forEach((i) => {
          custoPorPedido[i.orcamento_id] = (custoPorPedido[i.orcamento_id] || 0) + Number(i.custo_real || 0) * Number(i.qtd || 0);
        });
      }

      const meses = [];
      const mapaMes = {};
      for (let i = 5; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        const chave = `${d.getFullYear()}-${d.getMonth()}`;
        const m = { chave, label: `${NOMES_MES_ABREV[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`, faturamento: 0, margemLiquida: 0, pedidos: 0 };
        meses.push(m);
        mapaMes[chave] = m;
      }
      lista.forEach((o) => {
        const d = new Date(o.entregue_em);
        const chave = `${d.getFullYear()}-${d.getMonth()}`;
        const m = mapaMes[chave];
        if (!m) return;
        const calc = calcularLinhaResumo({
          valorPago: o.valor_total,
          custoPecas: custoPorPedido[o.id] || 0,
          impostoPct: o.imposto_total,
          comissaoPct: o.perfis?.comissao_percentual
        });
        m.faturamento += Number(o.valor_total || 0);
        m.margemLiquida += calc.margemLiquida;
        m.pedidos += 1;
      });
      setSaudeFinanceira(meses);
    } catch (e) {
      console.error("[visão 360 - saúde financeira] falha ao carregar:", e);
    }
    setCarregandoSaude(false);
  }

  async function carregarFeed(unidadeId) {
    const { data } = await supabase
      .from("auditoria_logs")
      .select("*, perfis(nome)")
      .eq("unidade_id", unidadeId)
      .order("criado_em", { ascending: false })
      .limit(20);
    setFeed(data || []);
  }

  // ---- Derivados do período selecionado ----

  const linhas = useMemo(() => {
    const itensPorPedido = {};
    itens.forEach((i) => {
      itensPorPedido[i.orcamento_id] = [...(itensPorPedido[i.orcamento_id] || []), i];
    });
    return pedidosEntregues.map((o) => {
      const seusItens = itensPorPedido[o.id] || [];
      const custoPecas = seusItens.reduce((s, i) => s + Number(i.custo_real || 0) * Number(i.qtd || 0), 0);
      const calc = calcularLinhaResumo({
        valorPago: o.valor_total,
        custoPecas,
        impostoPct: o.imposto_total,
        comissaoPct: o.perfis?.comissao_percentual
      });
      return { ...o, valorPago: Number(o.valor_total || 0), custoPecas, ...calc };
    });
  }, [pedidosEntregues, itens]);

  const totais = linhas.reduce(
    (acc, l) => ({
      valorPago: acc.valorPago + l.valorPago,
      margemLiquida: acc.margemLiquida + l.margemLiquida,
      comissaoVendedor: acc.comissaoVendedor + l.comissaoVendedor
    }),
    { valorPago: 0, margemLiquida: 0, comissaoVendedor: 0 }
  );
  const qtdEntregues = linhas.length;
  const ticketMedio = qtdEntregues > 0 ? totais.valorPago / qtdEntregues : 0;

  const qtdCriados = pedidosCriados.length;
  const revisados = pedidosCriados.filter((o) => o.status !== "Pendente de Análise").length;
  const aprovados = pedidosCriados.filter((o) => o.status !== "Pendente de Análise" && o.status !== "Rejeitado").length;
  const taxaConversao = revisados > 0 ? (aprovados / revisados) * 100 : 0;

  const funil = useMemo(() => {
    return ETAPAS_FUNIL.map((etapa) => ({
      label: etapa.label,
      cor: etapa.cor,
      valor: pedidosCriados.filter((o) => etapa.teste(o.status)).length
    }));
  }, [pedidosCriados]);

  const cicloMedio = useMemo(() => {
    const dias = pedidosEntregues
      .map((o) => (new Date(o.entregue_em) - new Date(o.criado_em)) / 86400000)
      .filter((d) => d >= 0);
    if (dias.length === 0) return null;
    return {
      media: dias.reduce((s, d) => s + d, 0) / dias.length,
      maisRapido: Math.min(...dias),
      maisLento: Math.max(...dias),
      qtd: dias.length
    };
  }, [pedidosEntregues]);

  const cicloMedioAnterior = useMemo(() => {
    const dias = cicloAnterior
      .map((o) => (new Date(o.entregue_em) - new Date(o.criado_em)) / 86400000)
      .filter((d) => d >= 0);
    if (dias.length === 0) return null;
    return { media: dias.reduce((s, d) => s + d, 0) / dias.length };
  }, [cicloAnterior]);

  const rankingVendedores = useMemo(() => {
    const mapa = {};
    linhas.forEach((l) => {
      const chave = l.vendedor_id || "sem-vendedor";
      if (!mapa[chave]) {
        mapa[chave] = { vendedorId: l.vendedor_id, nome: l.perfis?.nome || "Sem vendedor", fotoUrl: l.perfis?.foto_url, qtdPedidos: 0, valorVendido: 0, comissaoTotal: 0 };
      }
      mapa[chave].qtdPedidos += 1;
      mapa[chave].valorVendido += l.valorPago;
      mapa[chave].comissaoTotal += l.comissaoVendedor;
    });
    return Object.values(mapa).sort((a, b) => b.valorVendido - a.valorVendido);
  }, [linhas]);

  const topClientes = useMemo(() => {
    const mapa = new Map();
    linhas.forEach((l) => {
      const nome = l.clientes?.nome || "—";
      mapa.set(nome, (mapa.get(nome) || 0) + l.valorPago);
    });
    return Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [linhas]);

  const topPecas = useMemo(() => {
    const mapa = new Map();
    itens.forEach((i) => {
      const chave = `${i.codigo} — ${i.descricao_resumida || ""}`;
      const atual = mapa.get(chave) || { qtd: 0, valor: 0 };
      mapa.set(chave, { qtd: atual.qtd + Number(i.qtd || 0), valor: atual.valor + Number(i.venda_total || 0) });
    });
    return Array.from(mapa.entries()).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [itens]);

  const taxaNfEmitida = qtdEntregues > 0 ? (linhas.filter((l) => l.nota_fiscal_numero).length / qtdEntregues) * 100 : 0;

  const rotuloPeriodo = tipoPeriodo === "semanal"
    ? `${rotuloSemana(semanaRef)} (${periodo.de.toLocaleDateString("pt-BR")} – ${periodo.ate.toLocaleDateString("pt-BR")})`
    : (() => {
        const [ano, mes] = mesSelecionado.split("-").map(Number);
        return `${NOMES_MES[(mes || 1) - 1]}/${ano}`;
      })();

  const alertas = [
    {
      id: "fiscal", label: "Notas fiscais pendentes", icone: FileCheck2, cor: "#4338CA", href: "/fiscal", sempreAcessivel: true,
      valor: unidadeInfo?.obriga_nota_fiscal ? fiscalPendentes.length : 0,
      detalhe: unidadeInfo?.obriga_nota_fiscal ? `${fiscalPendentes.length} pedido(s) liberado(s) sem NF emitida` : "Unidade não exige nota fiscal",
      ativo: !!unidadeInfo?.obriga_nota_fiscal && fiscalPendentes.length > 0
    },
    {
      id: "estoque", label: "Pendências no Estoque", icone: Warehouse, cor: "#2E7F97", href: "/estoque", sempreAcessivel: true,
      valor: pendenciasEstoque,
      detalhe: `${pendenciasEstoque} pedido(s) aguardando alguma etapa do estoque`,
      ativo: pendenciasEstoque > 0
    },
    {
      id: "parados", label: "Pedidos parados há 5+ dias", icone: AlertTriangle, cor: "#C2801F", href: "/estoque/pedidos", sempreAcessivel: true,
      valor: pedidosParados,
      detalhe: `${pedidosParados} pedido(s) sem avançar de status`,
      ativo: pedidosParados > 0
    },
    {
      id: "pagamento", label: "Pagamentos em aberto", icone: HandCoins, cor: "#E1614F", href: "/financeiro/contas-a-receber", sempreAcessivel: false,
      valor: pagamentoAberto.qtd,
      detalhe: `${pagamentoAberto.qtd} pedido(s) · ${fmtBRL(pagamentoAberto.soma)} em aberto`,
      ativo: pagamentoAberto.qtd > 0
    },
    {
      id: "estornos", label: "Estornos pendentes", icone: RotateCcw, cor: "var(--danger)", href: "/financeiro/estornos", sempreAcessivel: false,
      valor: estornosPendentes,
      detalhe: `${estornosPendentes} solicitação(ões) aguardando o Financeiro`,
      ativo: estornosPendentes > 0
    }
  ];

  if (perfil === undefined) {
    return <AppShell titulo="Visão 360º"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !CARGOS_VISAO_360.includes(perfil.cargo)) {
    return (
      <AppShell titulo="Visão 360º">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente e Supervisor veem a Visão 360º.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Visão 360º">
      {/* Hero */}
      <div
        className="rounded-2xl p-6 mb-5 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 100%, white 12%) 0%, var(--accent) 55%, var(--accent-dark) 100%)" }}
      >
        <div className="absolute -top-10 -right-10 w-56 h-56 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="absolute -bottom-14 -left-6 w-40 h-40 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.18)" }}>
              <Sparkles size={22} className="text-white" />
            </div>
            <div>
              <p className="font-display font-bold text-white text-lg leading-tight">Visão 360º</p>
              <p className="text-white/75 text-xs mt-0.5">Panorama executivo{unidadeInfo?.nome ? ` — ${unidadeInfo.nome}` : ""}, atualizado em tempo real.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono font-semibold text-white" style={{ background: "rgba(255,255,255,0.15)" }}>
            <span className="relative w-2 h-2 rounded-full shrink-0" style={{ background: "#7CE0B8" }}>
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "#7CE0B8", opacity: 0.8 }} />
            </span>
            AO VIVO
          </div>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="card p-4 mb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <button className={`chip ${tipoPeriodo === "mensal" ? "chip-active" : ""}`} onClick={() => setTipoPeriodo("mensal")}>Mensal</button>
          <button className={`chip ${tipoPeriodo === "semanal" ? "chip-active" : ""}`} onClick={() => setTipoPeriodo("semanal")}>Semanal</button>

          {tipoPeriodo === "mensal" ? (
            <input type="month" className="field-input py-1.5 text-xs w-auto" value={mesSelecionado} onChange={(e) => setMesSelecionado(e.target.value)} />
          ) : (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setSemanaRef((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })} className="w-7 h-7 flex items-center justify-center rounded-lg border border-line text-muted hover:text-ink" aria-label="Semana anterior">
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-mono font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Calendar size={11} className="inline mr-1 -mt-0.5" />
                {rotuloPeriodo}
              </span>
              <button type="button" onClick={() => setSemanaRef((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })} className="w-7 h-7 flex items-center justify-center rounded-lg border border-line text-muted hover:text-ink" aria-label="Próxima semana">
                <ChevronRight size={14} />
              </button>
              <button type="button" onClick={() => setSemanaRef(new Date())} className="btn-secondary text-xs py-1.5 ml-1">Semana atual</button>
            </div>
          )}
        </div>
      </div>

      {/* KPIs executivos */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <CardStat icone={Wallet} cor="#2E6DA8" label="Faturamento" valor={fmtBRL(totais.valorPago)} destaque />
        <CardStat icone={ClipboardList} cor="#4A90D9" label="Pedidos Criados" valor={String(qtdCriados)} />
        <CardStat icone={TrendingUp} cor="#7A4FB0" label="Taxa de Conversão" valor={fmtPct(taxaConversao)} tooltip="Pedidos revisados que não ficaram só na triagem nem foram rejeitados." />
        <CardStat icone={Receipt} cor="#C2801F" label="Ticket Médio" valor={fmtBRL(ticketMedio)} />
        <CardStat icone={PiggyBank} cor="#2C7C6E" corValor="#2C7C6E" label="Margem Líquida" valor={fmtBRL(totais.margemLiquida)} />
        <CardStat icone={Percent} cor="#E1614F" label="Comissões" valor={fmtBRL(totais.comissaoVendedor)} />
      </div>

      {/* Funil de vendas */}
      <div className="card p-5 mb-5">
        <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
          <Filter size={15} style={{ color: "var(--accent)" }} />
          Funil de vendas do período
        </p>
        {carregandoPeriodo ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : funil[0].valor === 0 ? (
          <p className="text-sm text-muted">Nenhum pedido recebido nesse período.</p>
        ) : (
          <div className="space-y-2.5">
            {funil.map((f, i) => {
              const pctDoTotal = funil[0].valor > 0 ? (f.valor / funil[0].valor) * 100 : 0;
              const pctDaEtapaAnterior = i > 0 && funil[i - 1].valor > 0 ? (f.valor / funil[i - 1].valor) * 100 : 100;
              return (
                <div key={f.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium">{f.label}</span>
                    <span className="font-mono text-muted">
                      {f.valor} pedido(s) · {pctDoTotal.toFixed(0)}% do total{i > 0 ? ` · ${pctDaEtapaAnterior.toFixed(0)}% da etapa anterior` : ""}
                    </span>
                  </div>
                  <div className="h-8 rounded-lg overflow-hidden" style={{ background: "var(--canvas)" }}>
                    <div
                      className="h-full rounded-lg flex items-center justify-end pr-2.5 transition-all"
                      style={{ width: `${Math.max(pctDoTotal, 4)}%`, background: `linear-gradient(90deg, ${f.cor}99, ${f.cor})` }}
                    >
                      <span className="text-white text-[11px] font-mono font-bold">{f.valor}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Central de alertas + Ciclo médio */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        <div className="card p-5 lg:col-span-2">
          <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <AlertTriangle size={15} style={{ color: "#C2801F" }} />
            Central de alertas consolidada
          </p>
          {carregandoAlertas ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : (
            <div className="space-y-2">
              {alertas.map((a) => {
                const Icone = a.icone;
                const clicavel = a.ativo && (a.sempreAcessivel || perfil.cargo === "Administrador");
                const Wrapper = clicavel ? "button" : "div";
                return (
                  <Wrapper
                    key={a.id}
                    type={clicavel ? "button" : undefined}
                    onClick={clicavel ? () => router.push(a.href) : undefined}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition ${clicavel ? "hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : ""}`}
                    style={{ borderColor: a.ativo ? `${a.cor}55` : "var(--line)", background: a.ativo ? `${a.cor}0F` : "transparent" }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${a.cor}1F`, color: a.cor }}>
                      <Icone size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.label}</p>
                      <p className="text-xs text-muted truncate">{a.detalhe}</p>
                    </div>
                    <span className="font-mono font-bold text-lg shrink-0" style={{ color: a.ativo ? a.cor : "var(--muted)" }}>{a.valor}</span>
                  </Wrapper>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5">
          <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Timer size={15} style={{ color: "var(--accent)" }} />
            Ciclo médio do pedido
          </p>
          {carregandoPeriodo ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : cicloMedio ? (
            <>
              <p className="font-mono font-bold text-3xl">
                {cicloMedio.media.toFixed(1)}
                <span className="text-sm text-muted font-normal ml-1">dias</span>
              </p>
              {cicloMedioAnterior && (
                <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: cicloMedio.media <= cicloMedioAnterior.media ? "#2C7C6E" : "var(--danger)" }}>
                  {cicloMedio.media <= cicloMedioAnterior.media ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                  {Math.abs(cicloMedio.media - cicloMedioAnterior.media).toFixed(1)} dias vs período anterior
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
                <div className="rounded-lg p-2.5" style={{ background: "rgba(63,167,150,0.10)" }}>
                  <p className="text-muted">Mais rápido</p>
                  <p className="font-mono font-bold" style={{ color: "#2C7C6E" }}>{cicloMedio.maisRapido.toFixed(1)}d</p>
                </div>
                <div className="rounded-lg p-2.5" style={{ background: "var(--danger-soft)" }}>
                  <p className="text-muted">Mais lento</p>
                  <p className="font-mono font-bold" style={{ color: "var(--danger)" }}>{cicloMedio.maisLento.toFixed(1)}d</p>
                </div>
              </div>
              <p className="text-[11px] text-muted mt-3">Baseado em {cicloMedio.qtd} pedido(s) entregues no período.</p>
            </>
          ) : (
            <p className="text-sm text-muted">Sem pedidos entregues no período.</p>
          )}
        </div>
      </div>

      {/* Ranking de vendedores gamificado */}
      <div className="card p-5 mb-5">
        <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
          <Trophy size={15} style={{ color: "#E8A33D" }} />
          Ranking de vendedores
        </p>
        {carregandoPeriodo ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : rankingVendedores.length === 0 ? (
          <p className="text-sm text-muted">Nenhum pedido entregue nesse período.</p>
        ) : (
          <div className="space-y-2">
            {rankingVendedores.map((v, i) => {
              const { atual, proximo, progresso } = tierDoVendedor(v.valorVendido);
              const TierIcone = atual.icone;
              const PosicaoIcone = ICONES_POSICAO[i];
              return (
                <div key={v.vendedorId || v.nome} className="flex items-center gap-3 p-3 rounded-xl border border-line">
                  <span className="w-6 text-center shrink-0">
                    {PosicaoIcone ? <PosicaoIcone size={18} style={{ color: CORES_POSICAO[i] }} /> : <span className="text-muted font-mono text-xs">{i + 1}</span>}
                  </span>
                  <Avatar nome={v.nome} fotoUrl={v.fotoUrl} tamanho={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm truncate">{v.nome}</p>
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${atual.cor}22`, color: atual.cor }}>
                        <TierIcone size={10} /> {atual.nome}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--canvas)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${progresso}%`, background: atual.cor }} />
                    </div>
                    {proximo && <p className="text-[10px] text-muted mt-0.5">Faltam {fmtBRL(proximo.min - v.valorVendido)} pra {proximo.nome}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-bold text-sm">{fmtBRL(v.valorVendido)}</p>
                    <p className="text-[11px] text-muted">{v.qtdPedidos} pedido(s) · {fmtBRL(v.comissaoTotal)} comissão</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Top clientes / Top peças */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div className="card p-5">
          <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Contact size={15} style={{ color: "var(--accent)" }} />
            Top 5 clientes do período
          </p>
          {topClientes.length === 0 ? (
            <p className="text-xs text-muted">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
              {topClientes.map((c, i) => (
                <div key={c.nome}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{i + 1}</span>
                      <span className="truncate">{c.nome}</span>
                    </span>
                    <span className="font-mono font-semibold shrink-0">{fmtBRL(c.valor)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--canvas)" }}>
                    <div className="h-full rounded-full" style={{ width: `${topClientes[0].valor > 0 ? (c.valor / topClientes[0].valor) * 100 : 0}%`, background: "var(--accent)" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Package size={15} style={{ color: "#9C5A34" }} />
            Top 5 peças mais vendidas
          </p>
          {topPecas.length === 0 ? (
            <p className="text-xs text-muted">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
              {topPecas.map((p, i) => (
                <div key={p.nome}>
                  <div className="flex items-center justify-between text-sm mb-1 gap-2">
                    <span className="flex items-center gap-2 truncate">
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "rgba(156,90,52,0.14)", color: "#9C5A34" }}>{i + 1}</span>
                      <span className="truncate">{p.nome}</span>
                    </span>
                    <span className="font-mono text-muted shrink-0">{p.qtd}un · {fmtBRL(p.valor)}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--canvas)" }}>
                    <div className="h-full rounded-full" style={{ width: `${topPecas[0].valor > 0 ? (p.valor / topPecas[0].valor) * 100 : 0}%`, background: "#9C5A34" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Saúde financeira — tendência 6 meses */}
      <div className="card p-5 mb-5">
        <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
          <TrendingUp size={15} style={{ color: "#2C7C6E" }} />
          Saúde financeira — tendência de 6 meses
        </p>
        <p className="text-xs text-muted mb-4">Faturamento e margem líquida dos pedidos entregues, mês a mês (não depende do filtro de período acima).</p>
        {carregandoSaude ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : (
          <div style={{ filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.10))" }}>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={saudeFinanceira} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradFaturamento360" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtBRLCompacto(v)} />
                <Tooltip formatter={(v, name) => [fmtBRL(v), name === "faturamento" ? "Faturamento" : "Margem Líquida"]} />
                <Legend formatter={(v) => (v === "faturamento" ? "Faturamento" : "Margem Líquida")} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="faturamento" stroke="var(--accent)" strokeWidth={2.5} fill="url(#gradFaturamento360)" />
                <Line type="monotone" dataKey="margemLiquida" stroke="#2C7C6E" strokeWidth={2.5} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Fiscal em destaque + Feed ao vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <FileCheck2 size={15} style={{ color: "#4338CA" }} />
            Fiscal em destaque
          </p>
          {carregandoAlertas ? (
            <p className="text-sm text-muted">Carregando...</p>
          ) : !unidadeInfo?.obriga_nota_fiscal ? (
            <p className="text-sm text-muted">Essa unidade não exige emissão de Nota Fiscal.</p>
          ) : (
            <>
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <p className="font-mono font-bold text-2xl" style={{ color: fiscalPendentes.length > 0 ? "var(--danger)" : "#2C7C6E" }}>{fiscalPendentes.length}</p>
                  <p className="text-xs text-muted">pedido(s) sem NF</p>
                </div>
                <div>
                  <p className="font-mono font-bold text-2xl">{fmtPct(taxaNfEmitida)}</p>
                  <p className="text-xs text-muted">com NF no período selecionado</p>
                </div>
              </div>
              {fiscalPendentes.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted font-mono mb-1.5">Pendentes há mais tempo</p>
                  <div className="space-y-1">
                    {fiscalPendentes.slice(0, 5).map((o) => (
                      <button key={o.id} onClick={() => router.push(`/estoque/${o.id}`)} className="w-full flex items-center justify-between text-xs px-3 py-2 rounded-lg hover:bg-canvas text-left transition">
                        <span>#{o.numero_unidade} · {o.clientes?.nome || "—"}</span>
                        <span className="text-muted font-mono">{fmtData(o.criado_em)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="card p-5">
          <p className="font-display font-semibold text-sm mb-4 flex items-center gap-2">
            <Radio size={15} style={{ color: "var(--danger)" }} />
            Feed de atividade ao vivo
            <span className="relative w-2 h-2 rounded-full ml-0.5" style={{ background: "#2C7C6E" }}>
              <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "#2C7C6E", opacity: 0.7 }} />
            </span>
          </p>
          <div className="space-y-2.5 max-h-[420px] overflow-y-auto -mr-1 pr-1">
            {feed.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma atividade recente.</p>
            ) : (
              feed.map((log) => {
                const Icone = ICONE_TIPO_FEED[log.tipo_evento] || History;
                const cor = COR_TIPO_FEED[log.tipo_evento] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
                return (
                  <div key={log.id} className="flex items-start gap-2.5 text-xs">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: cor.bg, color: cor.fg }}>
                      <Icone size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-ink leading-snug">{log.descricao}</p>
                      <p className="text-muted mt-0.5">{log.perfis?.nome || "Sistema"} · {fmtDataHora(log.criado_em)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
