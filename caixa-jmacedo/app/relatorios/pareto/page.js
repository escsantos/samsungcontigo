"use client";
import { useEffect, useState } from "react";
import { BarChart3, Building2, CalendarDays, CalendarCheck2, Eraser } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList } from "recharts";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { formatarMoedaSemSimbolo } from "../../../lib/formato";
import { listaMesesRecentes } from "../../../lib/fusoHorario";

// 0=domingo .. 6=sábado (mesma convenção do extract(dow) do Postgres)
const DIAS_SEMANA_ORDEM = [
  { dow: 1, sigla: "SEG", nome: "Segunda" },
  { dow: 2, sigla: "TER", nome: "Terça" },
  { dow: 3, sigla: "QUAR", nome: "Quarta" },
  { dow: 4, sigla: "QUI", nome: "Quinta" },
  { dow: 5, sigla: "SEX", nome: "Sexta" },
  { dow: 6, sigla: "SAB", nome: "Sábado" },
  { dow: 0, sigla: "DOM", nome: "Domingo" },
];
const NOMES_DIA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PALETA_UNIDADES = ["#2670B5", "#3F8A5C", "#9C5A34", "#7C56B5", "#0E7A72", "#B8862E", "#C9752E", "#4C94D6", "#B23B2E", "#5B6B84"];

function clarear(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * pct));
  const g = Math.min(255, Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * pct));
  const b = Math.min(255, Math.round((num & 255) + (255 - (num & 255)) * pct));
  return `rgb(${r},${g},${b})`;
}
function escurecer(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((num >> 16) & 255) * (1 - pct));
  const g = Math.round(((num >> 8) & 255) * (1 - pct));
  const b = Math.round((num & 255) * (1 - pct));
  return `rgb(${r},${g},${b})`;
}

function formatarDataCurta(dataIso) {
  const [, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}`;
}

/** Rótulo customizado acima de cada barra: (quantidade) e o valor em R$, em destaque. */
function RotuloBarra({ x, y, width, index, chaveQtd, chaveValor, dados }) {
  const qtd = dados[index]?.[chaveQtd] || 0;
  if (!qtd) return null;
  const valor = dados[index]?.[chaveValor] || 0;
  return (
    <g>
      <text x={x + width / 2} y={y - 22} textAnchor="middle" fontSize={15} fontWeight={800} fill="#1B3A5C">
        ({qtd})
      </text>
      <text x={x + width / 2} y={y - 7} textAnchor="middle" fontSize={12} fontWeight={600} fill="#3F8A5C">
        R$ {formatarMoedaSemSimbolo(valor)}
      </text>
    </g>
  );
}

function Conteudo() {
  const { unidades, linhaFiltro, detalharLinha } = useSessao();
  const mesesLista = listaMesesRecentes(18); // mais recente primeiro

  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState([]);
  const [mesesSelecionados, setMesesSelecionados] = useState([mesesLista[0].valor]); // começa com o mês atual
  const [diasSemanaSelecionados, setDiasSemanaSelecionados] = useState([]);
  const [dados, setDados] = useState([]);
  const [carregando, setCarregando] = useState(false);

  function alternarDiaSemana(dow) {
    const chave = String(dow);
    setDiasSemanaSelecionados((atual) => (atual.includes(chave) ? atual.filter((d) => d !== chave) : [...atual, chave]));
  }

  function limparSelecao() {
    setUnidadesSelecionadas([]);
    setMesesSelecionados([mesesLista[0].valor]);
    setDiasSemanaSelecionados([]);
    setDados([]);
  }

  async function carregar() {
    if (mesesSelecionados.length === 0 || diasSemanaSelecionados.length === 0) {
      setDados([]);
      return;
    }
    setCarregando(true);
    const unidadeIdsParam = unidadesSelecionadas.length > 0 ? unidadesSelecionadas : null;

    const { data, error } = await supabase.rpc("relatorio_pareto_por_data", {
      meses: mesesSelecionados,
      dias_semana: diasSemanaSelecionados.map(Number),
      unidade_ids: unidadeIdsParam,
      linha_param: linhaFiltro || null,
    });
    if (error) console.error("Erro no relatório Pareto:", error.message);
    setDados(data || []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidadesSelecionadas, mesesSelecionados.join(","), diasSemanaSelecionados, linhaFiltro, detalharLinha]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- monta os dados do gráfico: uma entrada por data, com qtd/valor por série ---
  // "série" = uma unidade (padrão), ou unidade+linha quando o modo é "Detalhado"
  // (unidades com CI e IH, tipo Campinas e São Miguel, aparecem separadas, com "(IH)" no nome)
  function chaveSerie(d) {
    return detalharLinha ? `${d.unidade_id}::${d.linha}` : d.unidade_id;
  }
  function nomeSerie(d) {
    return detalharLinha && d.linha === "ih" ? `${d.unidade_nome} (IH)` : d.unidade_nome;
  }

  const datasUnicas = [...new Set(dados.map((d) => d.dia))].sort();
  const seriesMap = new Map();
  dados.forEach((d) => seriesMap.set(chaveSerie(d), nomeSerie(d)));
  const unidadesNoResultado = [...seriesMap.entries()]; // [chave, nomeExibido]

  const dadosGrafico = datasUnicas.map((dia) => {
    const dow = new Date(dia + "T12:00:00").getDay();
    const obj = { dia, rotulo: `${NOMES_DIA_CURTO[dow]} ${formatarDataCurta(dia)}` };
    unidadesNoResultado.forEach(([chave]) => {
      const linhasDoDia = dados.filter((d) => d.dia === dia && chaveSerie(d) === chave);
      obj[`qtd_${chave}`] = linhasDoDia.reduce((s, d) => s + Number(d.qtd), 0);
      obj[`valor_${chave}`] = linhasDoDia.reduce((s, d) => s + Number(d.valor_total), 0);
    });
    return obj;
  });

  const totalQtd = dados.reduce((s, d) => s + Number(d.qtd), 0);
  const totalValor = dados.reduce((s, d) => s + Number(d.valor_total), 0);
  const idsUnidadesUnicas = [...new Set(dados.map((d) => d.unidade_id))];
  const nomeUnidadeUnica = idsUnidadesUnicas.length === 1 ? dados[0]?.unidade_nome : null;

  return (
    <div className="w-full">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <BarChart3 size={22} className="text-[#B8862E]" /> Pareto
          </h1>
          <p className="text-sm text-muted mt-1">Compare o volume e os valores recebidos entre as ocorrências do(s) dia(s) da semana escolhido(s).</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BotaoAtualizar aoAtualizar={carregar} />
          <button
            onClick={limparSelecao}
            title="Limpar seleção"
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-white
              bg-gradient-to-b from-[#8B96A8] to-[#5B6B84]
              shadow-[0_3px_0_0_rgba(0,0,0,0.18),0_8px_16px_-4px_rgba(91,107,132,0.55)]
              hover:brightness-105 hover:-translate-y-0.5
              active:translate-y-0 active:shadow-[0_1px_0_0_rgba(0,0,0,0.18),0_4px_8px_-2px_rgba(91,107,132,0.5)]
              transition-all duration-150"
          >
            <Eraser size={15} />
            Limpar seleção
          </button>
        </div>
      </div>

      {/* Filtros — tudo numa linha só */}
      <div className="card p-4 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="min-w-[260px] flex-1">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><Building2 size={11} /> Unidades</p>
            <select
              multiple
              size={3}
              className="field-input text-sm w-full"
              value={unidadesSelecionadas}
              onChange={(e) => setUnidadesSelecionadas([...e.target.selectedOptions].map((o) => o.value))}
            >
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted mt-1">Nenhuma marcada = todas. Shift ou Ctrl + clique pra marcar várias.</p>
          </div>

          <div className="min-w-[180px]">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><CalendarDays size={11} /> Mês</p>
            <select
              multiple
              size={3}
              className="field-input text-sm w-full"
              value={mesesSelecionados}
              onChange={(e) => setMesesSelecionados([...e.target.selectedOptions].map((o) => o.value))}
            >
              {mesesLista.map((m) => (
                <option key={m.valor} value={m.valor}>{m.rotulo}</option>
              ))}
            </select>
            <p className="text-[10px] text-muted mt-1">Shift + clique pra marcar vários meses.</p>
          </div>

          <div className="w-[220px]">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1.5 flex items-center gap-1"><CalendarCheck2 size={11} /> Dia da semana</p>
            <div className="grid grid-cols-4 gap-1">
              {DIAS_SEMANA_ORDEM.map((d) => {
                const marcado = diasSemanaSelecionados.includes(String(d.dow));
                return (
                  <label
                    key={d.dow}
                    title={d.nome}
                    className={`checkbox-tile justify-center text-xs font-semibold py-1.5 px-0 ${marcado ? "is-checked" : ""}`}
                  >
                    <input type="checkbox" className="sr-only" checked={marcado} onChange={() => alternarDiaSemana(d.dow)} />
                    {d.sigla}
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Resumo */}
      {dados.length > 0 && (
        <div className="flex items-center gap-6 mb-4 text-sm">
          <p className="text-muted">
            <span className="font-mono-num font-semibold text-ink">{totalQtd}</span> lançamento(s) no total
          </p>
          <p className="text-muted">
            <span className="font-mono-num font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalValor)}</span> recebido no total
          </p>
        </div>
      )}

      {/* Gráfico */}
      <div className="card p-5">
        {nomeUnidadeUnica && (
          <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-1.5"><Building2 size={14} className="text-[#2670B5]" /> {nomeUnidadeUnica}</p>
        )}
        {mesesSelecionados.length === 0 || diasSemanaSelecionados.length === 0 ? (
          <p className="text-sm text-muted py-16 text-center">Selecione ao menos um mês e um dia da semana pra ver o gráfico.</p>
        ) : carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : dadosGrafico.length === 0 ? (
          <p className="text-sm text-muted py-16 text-center">Nenhum lançamento encontrado para esses filtros.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(420, 70 + unidadesNoResultado.length * 4)}>
            <BarChart data={dadosGrafico} margin={{ top: 44, right: 20, left: 0, bottom: 8 }} barGap={4}>
              <defs>
                {unidadesNoResultado.map(([id], i) => {
                  const cor = PALETA_UNIDADES[i % PALETA_UNIDADES.length];
                  return (
                    <linearGradient key={id} id={`grad-pareto-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={clarear(cor, 0.55)} />
                      <stop offset="45%" stopColor={cor} />
                      <stop offset="100%" stopColor={escurecer(cor, 0.28)} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E7EC" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 12, fontWeight: 700, fill: "#1B3A5C" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B6D76" }}
                width={72}
                tickFormatter={(v) => `R$ ${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`}
              />
              <Tooltip formatter={(v, nome) => [`R$ ${formatarMoedaSemSimbolo(v)}`, nome]} />
              {unidadesNoResultado.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {unidadesNoResultado.map(([id, nome], i) => (
                <Bar key={id} dataKey={`valor_${id}`} name={nome} fill={`url(#grad-pareto-${id})`} radius={[6, 6, 0, 0]} maxBarSize={58}>
                  <LabelList
                    dataKey={`valor_${id}`}
                    content={(props) => <RotuloBarra {...props} chaveQtd={`qtd_${id}`} chaveValor={`valor_${id}`} dados={dadosGrafico} />}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function ParetoPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
