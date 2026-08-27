"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert, Wallet, Tag, Package, Landmark, TrendingUp, Percent, PiggyBank,
  ClipboardCheck, Truck, ChevronRight, ChevronLeft
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import CardStat from "../../components/CardStat";
import { inicioHoje, fimHoje } from "../../lib/periodo";
import { inicioSemana, fimSemana, rotuloSemana, calcularLinhaResumo } from "../../lib/relatorios";
import { getUnidadeAtiva } from "../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "R$ 0,00";
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
function noPeriodo(dataStr, intervalo) {
  if (!dataStr) return false;
  if (!intervalo) return true;
  const t = new Date(dataStr).getTime();
  return t >= intervalo.de.getTime() && t <= intervalo.ate.getTime();
}
function diaCurto(d) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fimMes(data) {
  const d = new Date(data.getFullYear(), data.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}
function inicioMesOffset(mesesAtras) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - mesesAtras, 1);
}
function rotuloMes(d) {
  const s = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
  return s.replace(".", "").replace(/^./, (c) => c.toUpperCase());
}
function mesInputStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseMesInput(str) {
  const [y, m] = str.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

const FILTROS = [
  { id: "hoje", label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes", label: "Mês" },
  { id: "personalizado", label: "Personalizado" }
];

// Gera os "buckets" (grupos) do eixo horizontal do gráfico, no formato certo
// pra cada granularidade.
function gerarBuckets(granularidade, de, ate) {
  const buckets = [];
  if (granularidade === "semana") {
    let cursor = inicioSemana(de);
    const limite = inicioSemana(ate);
    let guarda = 0;
    while (cursor.getTime() <= limite.getTime() && guarda < 60) {
      const fimB = fimSemana(cursor);
      buckets.push({
        chave: cursor.getTime(),
        rotulo: rotuloSemana(cursor),
        subRotulo: `${diaCurto(cursor)}–${diaCurto(fimB)}`,
        de: new Date(cursor),
        ate: fimB
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
      guarda++;
    }
  } else if (granularidade === "mes") {
    let cursor = new Date(de.getFullYear(), de.getMonth(), 1);
    const limite = new Date(ate.getFullYear(), ate.getMonth(), 1);
    let guarda = 0;
    while (cursor.getTime() <= limite.getTime() && guarda < 60) {
      buckets.push({
        chave: cursor.getTime(),
        rotulo: rotuloMes(cursor),
        subRotulo: rotuloMes(cursor),
        de: new Date(cursor.getFullYear(), cursor.getMonth(), 1, 0, 0, 0, 0),
        ate: fimMes(cursor)
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      guarda++;
    }
  } else {
    buckets.push({ chave: "hoje", rotulo: diaCurto(new Date()), subRotulo: "Hoje", de, ate });
  }
  return buckets;
}

function SeletorSemana({ label, valor, onChange }) {
  const ini = inicioSemana(valor);
  const fim = fimSemana(valor);
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-muted">{label}:</span>
      <button
        type="button"
        onClick={() => { const n = new Date(valor); n.setDate(n.getDate() - 7); onChange(n); }}
        className="w-6 h-6 flex items-center justify-center rounded-md border border-line text-muted hover:text-ink"
        aria-label="Semana anterior"
      >
        <ChevronLeft size={12} />
      </button>
      <span className="text-xs font-mono font-bold px-2 py-1 rounded-md whitespace-nowrap" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
        {rotuloSemana(ini)} ({diaCurto(ini)}–{diaCurto(fim)})
      </span>
      <button
        type="button"
        onClick={() => { const n = new Date(valor); n.setDate(n.getDate() + 7); onChange(n); }}
        className="w-6 h-6 flex items-center justify-center rounded-md border border-line text-muted hover:text-ink"
        aria-label="Próxima semana"
      >
        <ChevronRight size={12} />
      </button>
    </div>
  );
}

const CORES_SERIE = { recebido: "#2C7C6E", pago: "#E1614F" };

function TooltipGrafico({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0]?.payload;
  return (
    <div className="rounded-lg px-3 py-2 shadow-lg text-xs" style={{ background: "var(--surface)", border: "1px solid var(--line)" }}>
      <p className="font-semibold mb-1.5">{item?.subRotulo}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-1.5 mb-0.5 last:mb-0">
          <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ background: CORES_SERIE[p.dataKey] || p.color }} />
          <span className="text-muted">{p.name}:</span>
          <span className="font-mono font-semibold">{fmtBRL(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function FinanceiroDashboardPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);

  const [filtro, setFiltro] = useState("mes");
  const [personalizadoModo, setPersonalizadoModo] = useState("semana");
  const [semanaPersDe, setSemanaPersDe] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 35); return d; });
  const [semanaPersAte, setSemanaPersAte] = useState(() => new Date());
  const [mesPersDe, setMesPersDe] = useState(() => inicioMesOffset(5));
  const [mesPersAte, setMesPersAte] = useState(() => new Date());

  const [orcamentosConfirmados, setOrcamentosConfirmados] = useState([]);
  const [itensLiberados, setItensLiberados] = useState([]);
  const [itensPagosFabricante, setItensPagosFabricante] = useState([]);
  const [pendentesRecebimento, setPendentesRecebimento] = useState(0);
  const [pendentesFabricante, setPendentesFabricante] = useState(0);

  const { granularidade, de, ate } = useMemo(() => {
    if (filtro === "hoje") return { granularidade: "dia", de: inicioHoje(), ate: fimHoje() };
    if (filtro === "semana") {
      const iniAtual = inicioSemana(new Date());
      const de6 = new Date(iniAtual.getFullYear(), iniAtual.getMonth(), iniAtual.getDate() - 7 * 5);
      return { granularidade: "semana", de: de6, ate: fimSemana(new Date()) };
    }
    if (filtro === "mes") {
      return { granularidade: "mes", de: inicioMesOffset(5), ate: fimMes(new Date()) };
    }
    // personalizado
    if (personalizadoModo === "semana") {
      return { granularidade: "semana", de: inicioSemana(semanaPersDe), ate: fimSemana(semanaPersAte) };
    }
    return { granularidade: "mes", de: new Date(mesPersDe.getFullYear(), mesPersDe.getMonth(), 1), ate: fimMes(mesPersAte) };
  }, [filtro, personalizadoModo, semanaPersDe, semanaPersAte, mesPersDe, mesPersAte]);

  const intervalo = { de, ate };

  const confirmadosPeriodo = orcamentosConfirmados.filter((o) => noPeriodo(o.recebimento_confirmado_em, intervalo));
  const itensPagosPeriodo = itensPagosFabricante.filter((i) => noPeriodo(i.custo_pago_fabricante_em, intervalo));

  const buckets = useMemo(() => gerarBuckets(granularidade, de, ate), [granularidade, de, ate]);
  const dadosGrafico = useMemo(() => {
    return buckets.map((b) => ({
      ...b,
      recebido: orcamentosConfirmados.filter((o) => noPeriodo(o.recebimento_confirmado_em, b)).reduce((s, o) => s + o.valorRealPago, 0),
      pago: itensPagosFabricante.filter((i) => noPeriodo(i.custo_pago_fabricante_em, b)).reduce((s, i) => s + Number(i.custo_real || 0) * i.qtd, 0)
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, orcamentosConfirmados, itensPagosFabricante]);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
    })();
  }, []);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!["Administrador", "Financeiro"].includes(perfil?.cargo)) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function carregar() {
    setCarregando(true);
    const unidadeAtiva = getUnidadeAtiva();

    let queryOrc = supabase
      .from("orcamentos")
      .select("id, valor_total, desconto, imposto_total, vendedor_id, valor_herdado_pai, recebimento_confirmado, recebimento_confirmado_em, perfis!orcamentos_vendedor_id_fkey(comissao_percentual)");
    if (unidadeAtiva) queryOrc = queryOrc.eq("unidade_id", unidadeAtiva.id);
    const { data: orcs } = await queryOrc;

    // busca pagamentos só dos pedidos dessa unidade (via tabela real de pagamentos,
    // nunca confiando só no campo valor_pago, que só é atualizado no Faturamento Efetuado)
    const idsPedidos = (orcs || []).map((o) => o.id);
    const { data: todosPagamentos } = idsPedidos.length
      ? await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsPedidos)
      : { data: [] };
    const pagoPorPedido = {};
    (todosPagamentos || []).forEach((p) => {
      pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
    });

    const comValorReal = (orcs || [])
      .map((o) => ({ ...o, valorRealPago: (pagoPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0) }))
      .filter((o) => o.valorRealPago > 0.004);

    setOrcamentosConfirmados(comValorReal.filter((o) => o.recebimento_confirmado));
    setPendentesRecebimento(comValorReal.filter((o) => !o.recebimento_confirmado).length);

    const { data: itens } = await supabase
      .from("orcamento_itens")
      .select("id, orcamento_id, custo_real, qtd, custo_pago_fabricante, custo_pago_fabricante_em, orcamentos!inner(unidade_id)")
      .eq("liberado", true)
      .eq("orcamentos.unidade_id", unidadeAtiva?.id || 0);
    setItensLiberados(itens || []);
    setItensPagosFabricante((itens || []).filter((i) => i.custo_pago_fabricante));
    setPendentesFabricante((itens || []).filter((i) => !i.custo_pago_fabricante).length);

    setCarregando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Financeiro"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Financeiro">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  // custo das peças, no mesmo critério do relatório Resumo, só que aplicado
  // aos pedidos com recebimento confirmado no período (mesma base do "Valor Recebido")
  const idsConfirmadosPeriodo = new Set(confirmadosPeriodo.map((o) => o.id));
  const custoPorPedido = {};
  itensLiberados.forEach((i) => {
    if (!idsConfirmadosPeriodo.has(i.orcamento_id)) return;
    custoPorPedido[i.orcamento_id] = (custoPorPedido[i.orcamento_id] || 0) + Number(i.custo_real || 0) * Number(i.qtd || 0);
  });
  const linhasResumo = confirmadosPeriodo.map((o) => {
    const custoPecas = custoPorPedido[o.id] || 0;
    return {
      ...o,
      custoPecas,
      ...calcularLinhaResumo({
        valorPago: o.valorRealPago,
        custoPecas,
        impostoPct: o.imposto_total,
        comissaoPct: o.perfis?.comissao_percentual
      })
    };
  });
  const totais = linhasResumo.reduce(
    (acc, l) => ({
      recebido: acc.recebido + l.valorRealPago,
      desconto: acc.desconto + Number(l.desconto || 0),
      custoPecas: acc.custoPecas + l.custoPecas,
      valorImposto: acc.valorImposto + l.valorImposto,
      margemBruta: acc.margemBruta + l.margemBruta,
      comissaoVendedor: acc.comissaoVendedor + l.comissaoVendedor,
      margemLiquida: acc.margemLiquida + l.margemLiquida
    }),
    { recebido: 0, desconto: 0, custoPecas: 0, valorImposto: 0, margemBruta: 0, comissaoVendedor: 0, margemLiquida: 0 }
  );
  const totalLucroLiquidoPct = totais.recebido > 0 ? (totais.margemLiquida / totais.recebido) * 100 : 0;

  const rotuloJanela =
    filtro === "hoje" ? "Hoje" :
    filtro === "semana" ? "Últimas 6 semanas" :
    filtro === "mes" ? "Últimos 6 meses" :
    `${diaCurto(de)} – ${diaCurto(ate)}`;

  return (
    <AppShell titulo="Dashboard Financeiro">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {FILTROS.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)} className={`chip ${filtro === f.id ? "chip-active" : ""}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtro === "personalizado" && (
        <div className="card p-3 mb-3 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <button className={`chip ${personalizadoModo === "semana" ? "chip-active" : ""}`} onClick={() => setPersonalizadoModo("semana")}>Por semana</button>
            <button className={`chip ${personalizadoModo === "mes" ? "chip-active" : ""}`} onClick={() => setPersonalizadoModo("mes")}>Por mês</button>
          </div>
          {personalizadoModo === "semana" ? (
            <div className="flex items-center gap-4 flex-wrap">
              <SeletorSemana label="De" valor={semanaPersDe} onChange={setSemanaPersDe} />
              <SeletorSemana label="Até" valor={semanaPersAte} onChange={setSemanaPersAte} />
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="field-label">De</label>
                <input type="month" className="field-input py-1.5 text-xs w-auto" value={mesInputStr(mesPersDe)} onChange={(e) => setMesPersDe(parseMesInput(e.target.value))} />
              </div>
              <div>
                <label className="field-label">Até</label>
                <input type="month" className="field-input py-1.5 text-xs w-auto" value={mesInputStr(mesPersAte)} onChange={(e) => setMesPersAte(parseMesInput(e.target.value))} />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted mb-4">
        {rotuloJanela} · {diaCurto(de)} a {diaCurto(ate)}
      </p>

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-5">
            <CardStat icone={Wallet} cor="#2E6DA8" label="Valor Recebido" valor={fmtBRL(totais.recebido)} />
            <CardStat icone={Tag} cor="#D6336C" corValor="#D6336C" label="Descontos concedidos" valor={"-" + fmtBRL(totais.desconto)} />
            <CardStat icone={Package} cor="#9C5A34" label="Custo Total de Peças" valor={fmtBRL(totais.custoPecas)} destaque />
            <CardStat icone={Landmark} cor="#E1614F" label="Valor do Imposto" valor={fmtBRL(totais.valorImposto)} tooltip="Valor Recebido × % de imposto cadastrado nos pedidos." />
            <CardStat icone={TrendingUp} cor="#7A4FB0" label="Margem Bruta" valor={fmtBRL(totais.margemBruta)} tooltip="Valor Recebido − (Custo Total de Peças + Valor do Imposto)." />
            <CardStat icone={Percent} cor="#C2801F" label="Comissão Vendedor" valor={fmtBRL(totais.comissaoVendedor)} tooltip="Valor Recebido × % de comissão cadastrado no perfil de cada vendedor." />
            <CardStat
              icone={PiggyBank}
              cor="#2C7C6E"
              corValor="#2C7C6E"
              label={`Margem Líquida (${fmtPct(totalLucroLiquidoPct)})`}
              valor={fmtBRL(totais.margemLiquida)}
              tooltip="Margem Bruta − Comissão do Vendedor. O percentual é a margem líquida sobre o Valor Recebido."
            />
          </div>

          {dadosGrafico.length > 0 && (
            <div className="card p-5 mb-5">
              <p className="font-display font-semibold text-sm mb-4">Recebido x Pago ao fabricante</p>
              <div style={{ filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.14))" }}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={dadosGrafico} margin={{ left: 0, right: 10, top: 10 }} barGap={6}>
                    <defs>
                      <linearGradient id="gradRecebido" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5FD0B6" />
                        <stop offset="100%" stopColor="#1F5F52" />
                      </linearGradient>
                      <linearGradient id="gradPago" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F3947E" />
                        <stop offset="100%" stopColor="#A83B29" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtBRLCompacto} width={64} />
                    <Tooltip content={<TooltipGrafico />} cursor={{ fill: "rgba(127,127,127,0.08)" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="recebido" name="Recebido" fill="url(#gradRecebido)" radius={[6, 6, 0, 0]} maxBarSize={64} />
                    <Bar dataKey="pago" name="Pago ao fabricante" fill="url(#gradPago)" radius={[6, 6, 0, 0]} maxBarSize={64} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => router.push("/financeiro/recebimentos")}
              className="card p-5 text-left hover:-translate-y-0.5 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
                  <ClipboardCheck size={19} />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Confirmar Recebimentos</p>
                  <p className="text-xs text-muted mt-0.5">{pendentesRecebimento} pedido(s) aguardando confirmação</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
            <button
              onClick={() => router.push("/financeiro/fornecedor")}
              className="card p-5 text-left hover:-translate-y-0.5 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(225,97,79,0.14)", color: "#E1614F" }}>
                  <Truck size={19} />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Pagamento ao Fabricante</p>
                  <p className="text-xs text-muted mt-0.5">{pendentesFabricante} peça(s) aguardando confirmação</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}
