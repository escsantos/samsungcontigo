"use client";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Calendar,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  SlidersHorizontal,
  Building2,
  Clock,
  Percent,
  Hash,
  Flame,
  TrendingUp,
  Tags,
  Grid3x3,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  ComposedChart,
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerEstatisticas } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo } from "../../../lib/formato";
import { hojeBrasil } from "../../../lib/fusoHorario";

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const NOMES_DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const TIPOS_PERIODO = [
  { id: "diario", rotulo: "Diário", icone: CalendarDays, descricao: "Últimos 30 dias, dia a dia" },
  { id: "semanal", rotulo: "Semanal", icone: CalendarRange, descricao: "Últimas 12 semanas" },
  { id: "mensal", rotulo: "Mensal", icone: CalendarClock, descricao: "Últimos 12 meses" },
  { id: "personalizado", rotulo: "Personalizado", icone: SlidersHorizontal, descricao: "Escolha o período" },
];

function diaSeguinte(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function somarDias(dataIso, qtd) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + qtd);
  return d.toISOString().slice(0, 10);
}

function inicioDaSemanaDe(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

function inicioMesAtual() {
  return hojeBrasil().slice(0, 7) + "-01";
}

function dataInicioMesesAtras(meses) {
  const [ano, mes] = hojeBrasil().split("-").map(Number);
  let m = mes - (meses - 1);
  let a = ano;
  while (m <= 0) {
    m += 12;
    a -= 1;
  }
  return `${a}-${String(m).padStart(2, "0")}-01`;
}

function formatarDataCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

function formatarMesCurto(chaveMes) {
  const [ano, mes] = chaveMes.split("-");
  return `${mes}/${ano}`;
}

function Conteudo() {
  const { usuario, unidades, marcasDisponiveis } = useSessao();
  const permitido = podeVerEstatisticas(usuario.cargo);

  const [tipoPeriodo, setTipoPeriodo] = useState("diario"); // "diario" | "semanal" | "mensal" | "personalizado"
  const [dataInicioCustom, setDataInicioCustom] = useState(somarDias(hojeBrasil(), -30));
  const [dataFimCustom, setDataFimCustom] = useState(hojeBrasil());
  const [escopo, setEscopo] = useState("todas"); // "todas" | "marca:X" | "unidade:<id>"
  const [carregando, setCarregando] = useState(true);

  const [kpis, setKpis] = useState({ hoje: 0, semana: 0, mes: 0, ticketMedio: 0, totalPeriodo: 0 });
  const [serieDiaria, setSerieDiaria] = useState([]);
  const [porHora, setPorHora] = useState([]);
  const [mapaCalor, setMapaCalor] = useState([]);
  const [porCategoria, setPorCategoria] = useState([]);

  const unidadeIdParam = escopo.startsWith("unidade:") ? escopo.slice(8) : null;
  const marcaParam = escopo.startsWith("marca:") ? escopo.slice(6) : null;

  function calcularIntervalo() {
    const hoje = hojeBrasil();
    if (tipoPeriodo === "personalizado") {
      const inicio = dataInicioCustom;
      const fimExcl = diaSeguinte(dataFimCustom);
      const dias = Math.round((new Date(fimExcl) - new Date(inicio)) / 86400000);
      const granularidade = dias <= 45 ? "dia" : dias <= 180 ? "semana" : "mes";
      return { inicio, fimExcl, granularidade };
    }
    if (tipoPeriodo === "semanal") {
      return { inicio: somarDias(hoje, -7 * 11), fimExcl: diaSeguinte(hoje), granularidade: "semana" };
    }
    if (tipoPeriodo === "mensal") {
      return { inicio: dataInicioMesesAtras(12), fimExcl: diaSeguinte(hoje), granularidade: "mes" };
    }
    // diario
    return { inicio: somarDias(hoje, -29), fimExcl: diaSeguinte(hoje), granularidade: "dia" };
  }

  const intervalo = calcularIntervalo();

  async function carregar() {
    if (!permitido) return;
    setCarregando(true);
    const { inicio: dataInicioAmplo, fimExcl: dataFimExcl } = calcularIntervalo();
    const params = (dataInicio) => ({
      data_inicio: dataInicio,
      data_fim_excl: dataFimExcl,
      unidade_id_param: unidadeIdParam,
      marca_param: marcaParam,
    });

    const [resKpi, resSerie, resHora, resMapa, resCategoria] = await Promise.all([
      supabase.rpc("estatisticas_series_diarias", params(inicioMesAtual())),
      supabase.rpc("estatisticas_series_diarias", params(dataInicioAmplo)),
      supabase.rpc("estatisticas_por_hora", params(dataInicioAmplo)),
      supabase.rpc("estatisticas_mapa_calor", params(dataInicioAmplo)),
      supabase.rpc("estatisticas_por_categoria", params(dataInicioAmplo)),
    ]);

    const linhasKpi = resKpi.data || [];
    const hoje = hojeBrasil();
    const inicioSemana = somarDias(hoje, -6);
    const kpiHoje = linhasKpi.filter((l) => l.dia === hoje).reduce((s, l) => s + Number(l.qtd), 0);
    const kpiSemana = linhasKpi.filter((l) => l.dia >= inicioSemana && l.dia <= hoje).reduce((s, l) => s + Number(l.qtd), 0);
    const kpiMes = linhasKpi.reduce((s, l) => s + Number(l.qtd), 0);

    const serieAmpla = resSerie.data || [];
    const totalPeriodo = serieAmpla.reduce((s, l) => s + Number(l.qtd), 0);
    const valorPeriodo = serieAmpla.reduce((s, l) => s + Number(l.valor_total), 0);

    setKpis({
      hoje: kpiHoje,
      semana: kpiSemana,
      mes: kpiMes,
      ticketMedio: totalPeriodo > 0 ? valorPeriodo / totalPeriodo : 0,
      totalPeriodo,
    });
    setSerieDiaria(serieAmpla);
    setPorHora(resHora.data || []);
    setMapaCalor(resMapa.data || []);
    setPorCategoria((resCategoria.data || []).slice(0, 10));
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [tipoPeriodo, dataInicioCustom, dataFimCustom, escopo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!permitido) {
    return <p className="text-sm text-muted">Você não tem acesso às Estatísticas do sistema.</p>;
  }

  // --- CI vs IH ao longo do tempo (granularidade conforme o período escolhido) ---
  const { granularidade } = intervalo;
  const chaveBucket = (dia) => (granularidade === "mes" ? dia.slice(0, 7) : granularidade === "semana" ? inicioDaSemanaDe(dia) : dia);
  const rotuloBucket = (chave) => (granularidade === "mes" ? formatarMesCurto(chave) : formatarDataCurta(chave));

  const buckets = new Map();
  serieDiaria.forEach((l) => {
    const chave = chaveBucket(l.dia);
    if (!buckets.has(chave)) buckets.set(chave, { CI: 0, IH: 0 });
    const acc = buckets.get(chave);
    acc[l.linha === "ih" ? "IH" : "CI"] += Number(l.qtd);
  });
  const dadosTendencia = [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([chave, v]) => ({ rotulo: rotuloBucket(chave), CI: v.CI, IH: v.IH }));
  const temIH = dadosTendencia.some((d) => d.IH > 0);

  // --- Volume por horário (00h–23h, ordem cronológica) ---
  const horasCompletas = Array.from({ length: 24 }, (_, h) => {
    const encontrado = porHora.find((p) => p.hora === h);
    return { hora: h, qtd: encontrado ? Number(encontrado.qtd) : 0 };
  });
  const horaPico = horasCompletas.reduce((max, h) => (h.qtd > max.qtd ? h : max), horasCompletas[0]);
  const totalHoras = horasCompletas.reduce((s, h) => s + h.qtd, 0);
  let acumulado = 0;
  const dadosPareto = horasCompletas.map((h) => {
    acumulado += h.qtd;
    return {
      rotulo: `${String(h.hora).padStart(2, "0")}h`,
      qtd: h.qtd,
      acumuladoPct: totalHoras > 0 ? Math.round((acumulado / totalHoras) * 100) : 0,
    };
  });

  // --- Mapa de calor dia da semana × hora ---
  const mapaValores = new Map();
  let maxMapa = 0;
  mapaCalor.forEach((c) => {
    mapaValores.set(`${c.dia_semana}-${c.hora}`, Number(c.qtd));
    if (Number(c.qtd) > maxMapa) maxMapa = Number(c.qtd);
  });

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <BarChart3 size={22} className="text-[#2E6B7A]" /> Estatísticas do sistema
          </h1>
          <p className="text-sm text-muted mt-1">Volume de lançamentos, horários de pico e tendências de uso.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
            <select className="field-input pl-8 py-2 w-52" value={escopo} onChange={(e) => setEscopo(e.target.value)}>
              <option value="todas">Todas as unidades</option>
              <optgroup label="Por marca">
                {marcasDisponiveis.map((m) => (
                  <option key={m} value={`marca:${m}`}>{m}</option>
                ))}
              </optgroup>
              <optgroup label="Por unidade">
                {unidades.map((u) => (
                  <option key={u.id} value={`unidade:${u.id}`}>{u.nome}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <BotaoAtualizar aoAtualizar={carregar} />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Calendar size={14} className="text-muted" />
        <span className="text-xs text-muted mr-1">Período de análise:</span>
        {TIPOS_PERIODO.map((t) => {
          const Icone = t.icone;
          return (
            <button
              key={t.id}
              onClick={() => setTipoPeriodo(t.id)}
              title={t.descricao}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition ${
                tipoPeriodo === t.id ? "bg-[#2E6B7A] text-white font-medium" : "bg-white border border-line text-muted hover:border-[#2E6B7A]/50"
              }`}
            >
              <Icone size={12} /> {t.rotulo}
            </button>
          );
        })}
      </div>

      {tipoPeriodo === "personalizado" && (
        <div className="flex items-center gap-2 mb-6 text-sm">
          <label className="text-xs text-muted">De</label>
          <input
            type="date"
            className="field-input py-1.5 w-40"
            value={dataInicioCustom}
            max={dataFimCustom}
            onChange={(e) => setDataInicioCustom(e.target.value)}
          />
          <label className="text-xs text-muted">Até</label>
          <input
            type="date"
            className="field-input py-1.5 w-40"
            value={dataFimCustom}
            min={dataInicioCustom}
            max={hojeBrasil()}
            onChange={(e) => setDataFimCustom(e.target.value)}
          />
        </div>
      )}
      {tipoPeriodo !== "personalizado" && <div className="mb-6" />}

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2670B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2670B5]/10 flex items-center justify-center text-[#2670B5] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Registros hoje</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : kpis.hoje}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#3F8A5C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><TrendingUp size={16} /></div>
            <p className="text-xs text-muted mb-1">Registros na semana</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : kpis.semana}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#9C5A34]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#9C5A34]/10 flex items-center justify-center text-[#9C5A34] mb-2"><Calendar size={16} /></div>
            <p className="text-xs text-muted mb-1">Registros no mês</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : kpis.mes}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">Ticket médio</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{carregando ? "…" : `R$ ${formatarMoedaSemSimbolo(kpis.ticketMedio)}`}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C56B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C56B5]/10 flex items-center justify-center text-[#7C56B5] mb-2"><Flame size={16} /></div>
            <p className="text-xs text-muted mb-1">Horário de pico</p>
            <p className="font-mono-num text-xl font-semibold text-ink">
              {carregando || totalHoras === 0 ? "—" : `${String(horaPico.hora).padStart(2, "0")}h`}
            </p>
          </div>
        </div>
      </div>

      {/* CI vs IH ao longo do tempo */}
      <div className="card p-5 mb-6">
        <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5">
          <TrendingUp size={14} /> Registros ao longo do tempo{temIH ? " — CI vs IH" : ""}
        </p>
        <p className="text-xs text-muted mb-4">
          Agrupado por {granularidade === "mes" ? "mês" : granularidade === "semana" ? "semana" : "dia"} · {formatarDataCurta(intervalo.inicio)} até {formatarDataCurta(hojeBrasil())}.
        </p>
        {carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dadosTendencia} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "#6B6D76" }} />
              <YAxis tick={{ fontSize: 11, fill: "#6B6D76" }} width={36} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="CI" stroke="#2670B5" strokeWidth={2} dot={{ r: 2.5 }} />
              {temIH && <Line type="monotone" dataKey="IH" stroke="#0E7A72" strokeWidth={2} dot={{ r: 2.5 }} />}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-2 gap-5 mb-6">
        {/* Pareto por horário */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Clock size={14} /> Volume por horário do dia</p>
          <p className="text-xs text-muted mb-4">Das 00h às 23h, com o acumulado do dia em %.</p>
          {carregando ? (
            <p className="text-sm text-muted py-16 text-center">Carregando…</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={dadosPareto} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10, fill: "#6B6D76" }} interval={1} />
                <YAxis yAxisId="qtd" tick={{ fontSize: 10, fill: "#6B6D76" }} width={30} allowDecimals={false} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fontSize: 10, fill: "#6B6D76" }} width={32} domain={[0, 100]} />
                <Tooltip />
                <Bar yAxisId="qtd" dataKey="qtd" name="Registros" fill="#B8862E" radius={[3, 3, 0, 0]} />
                <Line yAxisId="pct" type="monotone" dataKey="acumuladoPct" name="Acumulado %" stroke="#7C56B5" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribuição por categoria */}
        <div className="card p-5">
          <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Tags size={14} /> Distribuição por categoria</p>
          <p className="text-xs text-muted mb-4">Top 10 categorias por quantidade de registros.</p>
          {carregando ? (
            <p className="text-sm text-muted py-16 text-center">Carregando…</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={porCategoria} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#6B6D76" }} allowDecimals={false} />
                <YAxis type="category" dataKey="categoria" tick={{ fontSize: 11, fill: "#6B6D76" }} width={110} />
                <Tooltip formatter={(v) => [v, "Registros"]} />
                <Bar dataKey="qtd" fill="#0E7A72" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Mapa de calor dia × hora */}
      <div className="card p-5">
        <p className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5"><Grid3x3 size={14} /> Mapa de calor — dia da semana × horário</p>
        <p className="text-xs text-muted mb-4">Quanto mais escuro, mais lançamentos aconteceram naquele horário.</p>
        {carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="border-collapse">
              <thead>
                <tr>
                  <td className="w-14" />
                  {Array.from({ length: 24 }, (_, h) => (
                    <td key={h} className="text-center text-[9px] text-muted pb-1 w-7">{h}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NOMES_DIA_CURTO.map((nomeDia, dow) => (
                  <tr key={dow}>
                    <td className="text-xs text-muted pr-2 whitespace-nowrap">{nomeDia}</td>
                    {Array.from({ length: 24 }, (_, h) => {
                      const v = mapaValores.get(`${dow}-${h}`) || 0;
                      const alpha = maxMapa > 0 ? Math.max(v / maxMapa, v > 0 ? 0.15 : 0.03) : 0.03;
                      return (
                        <td key={h} className="p-0.5">
                          <div
                            title={`${NOMES_DIA[dow]}, ${String(h).padStart(2, "0")}h — ${v} registro(s)`}
                            className="w-6 h-6 rounded-sm"
                            style={{ background: `rgba(184, 134, 46, ${alpha})` }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EstatisticasPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
