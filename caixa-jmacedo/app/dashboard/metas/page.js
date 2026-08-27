"use client";
import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { filtrarPorMarca } from "../../../lib/agregacaoValores";

const MEDALHAS = [
  { cor: "border-gold bg-gold-soft/50", texto: "text-gold-strong", rotulo: "1º lugar · ouro", barra: "#B8862E" },
  { cor: "border-prata bg-prata-soft/60", texto: "text-prata", rotulo: "2º lugar · prata", barra: "#7C819C" },
  { cor: "border-bronze bg-bronze-soft/60", texto: "text-bronze", rotulo: "3º lugar · bronze", barra: "#9C5A34" },
];

const CORES_UNIDADE = ["#2670B5", "#3F8A5C", "#9C5A34", "#7C819C", "#9B7BC9", "#D97AA0", "#C9A227", "#0E5A56", "#B8862E", "#4C94D6"];

function moedaCompacta(v) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v || 0));
}

function BandeiraQuadriculada({ size = 14 }) {
  const quadrados = [];
  const cols = 4;
  const rows = 3;
  const s = size / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) {
        quadrados.push(<rect key={`${r}-${c}`} x={c * s} y={r * s} width={s} height={s} fill="currentColor" />);
      }
    }
  }
  return (
    <svg width={size} height={(size * rows) / cols} viewBox={`0 0 ${size} ${(size * rows) / cols}`} className="shrink-0">
      <rect x="0" y="0" width={size} height={(size * rows) / cols} fill="white" stroke="#D9D8D0" strokeWidth="0.5" />
      {quadrados}
    </svg>
  );
}

function ConteudoMetas() {
  const { linhaFiltro, marcasFiltro, detalharLinha } = useSessao();
  const [unidadesRanking, setUnidadesRanking] = useState([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    setCarregando(true);
    if (!linhaFiltro) {
      const [{ data: ci }, { data: ih }] = await Promise.all([
        supabase.from("vw_painel_tv").select("*"),
        supabase.from("vw_painel_tv_ih").select("*"),
      ]);
      if (detalharLinha) {
        // "Detalhado" — CI e IH aparecem como linhas separadas, sem somar
        const combinado = [
          ...(ci || []).map((u) => ({ ...u, linha: "ci" })),
          ...(ih || []).map((u) => ({ ...u, linha: "ih" })),
        ];
        setUnidadesRanking(filtrarPorMarca(combinado, marcasFiltro));
      } else {
        // "CI + IH" — soma os totais por unidade numa linha só
        const mapa = new Map();
        [...(ci || []), ...(ih || [])].forEach((u) => {
          if (!mapa.has(u.unidade_id)) {
            mapa.set(u.unidade_id, { unidade_id: u.unidade_id, unidade_nome: u.unidade_nome, linha: null, total_dia: 0, total_semana: 0, total_mes: 0, meta_mes: 0 });
          }
          const acc = mapa.get(u.unidade_id);
          acc.total_dia += Number(u.total_dia);
          acc.total_semana += Number(u.total_semana);
          acc.total_mes += Number(u.total_mes);
          acc.meta_mes += Number(u.meta_mes);
        });
        setUnidadesRanking(filtrarPorMarca([...mapa.values()], marcasFiltro));
      }
    } else {
      const view = linhaFiltro === "ih" ? "vw_painel_tv_ih" : "vw_painel_tv";
      const { data } = await supabase.from(view).select("*");
      setUnidadesRanking(filtrarPorMarca((data || []).map((u) => ({ ...u, linha: linhaFiltro })), marcasFiltro));
    }
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [linhaFiltro, marcasFiltro, detalharLinha]); // eslint-disable-line react-hooks/exhaustive-deps

  const comMeta = unidadesRanking.map((u) => ({
    ...u,
    percentual: Number(u.meta_mes) > 0 ? (Number(u.total_mes) / Number(u.meta_mes)) * 100 : null,
  }));

  const ordenadas = [...comMeta].sort((a, b) => {
    if (a.percentual === null && b.percentual === null) return a.unidade_nome.localeCompare(b.unidade_nome);
    if (a.percentual === null) return 1;
    if (b.percentual === null) return -1;
    return b.percentual - a.percentual;
  });

  const top3 = ordenadas.slice(0, 3);
  const resto = ordenadas.slice(3);
  const metade = Math.ceil(resto.length / 2);
  const colunas = [resto.slice(0, metade), resto.slice(metade)];

  if (carregando) {
    return <p className="text-sm text-muted">Carregando…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
          <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
            <Target size={22} className="text-gold" /> Metas
          </h1>
          <p className="text-sm text-muted mt-1">Progresso da meta do mês, por unidade.</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} className="shrink-0" />
      </div>

      {ordenadas.length === 0 ? (
        <div className="card p-8 text-center text-muted">Nenhuma unidade encontrada.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            {top3.map((item, i) => (
              <div key={`${item.unidade_id}-${item.linha}`} className={`rounded-xl2 border-2 px-5 py-4 ${MEDALHAS[i]?.cor}`}>
                <p className={`text-xs mb-1 font-medium ${MEDALHAS[i]?.texto}`}>{MEDALHAS[i]?.rotulo}</p>
                <p className="font-display text-base font-semibold mb-1 leading-tight flex items-center gap-1.5">
                  {item.unidade_nome}
                  {item.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                </p>
                {item.percentual === null ? (
                  <>
                    <p className="font-display text-2xl font-semibold leading-none text-muted">— %</p>
                    <p className="text-xs text-muted mt-2">Meta não definida</p>
                  </>
                ) : (
                  <>
                    <p className="font-mono-num text-3xl font-semibold leading-none">{item.percentual.toFixed(0)}%</p>
                    <div className="h-2 bg-line rounded-full overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{ width: `${Math.min(100, item.percentual)}%`, background: MEDALHAS[i]?.barra }}
                      />
                    </div>
                    <p className="text-xs text-muted mt-1.5 font-mono-num">Meta: R$ {moedaCompacta(item.meta_mes)}</p>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {colunas.map((itensColuna, coluna) => {
              const offset = coluna === 0 ? 0 : metade;
              if (itensColuna.length === 0) return <div key={coluna} />;
              return (
                <div key={coluna} className="card divide-y divide-line">
                  {itensColuna.map((item, i) => {
                    const cor = CORES_UNIDADE[(offset + i + 3) % CORES_UNIDADE.length];
                    const semMeta = item.percentual === null;
                    const pct = semMeta ? 0 : Math.min(100, item.percentual);
                    return (
                      <div key={`${item.unidade_id}-${item.linha}`} className="flex items-center gap-3 px-4 py-3 text-sm">
                        <span className="text-muted font-mono-num text-xs w-6 shrink-0">{offset + i + 4}º</span>
                        <span className={`w-36 shrink-0 truncate flex items-center gap-1.5 ${semMeta ? "text-muted" : ""}`}>
                          {item.unidade_nome}
                          {item.linha === "ih" && (
                    <span className="text-[9px] px-1 py-0.5 rounded font-medium shrink-0 bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                        </span>
                        {semMeta ? (
                          <span className="text-xs text-muted italic">Meta não definida</span>
                        ) : (
                          <>
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1 h-2 bg-canvas rounded-full overflow-hidden border border-line">
                                <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: cor }} />
                              </div>
                              <BandeiraQuadriculada size={13} />
                            </div>
                            <span className="font-mono-num text-xs text-muted w-16 text-right shrink-0">R$ {moedaCompacta(item.meta_mes)}</span>
                            <span className="font-mono-num font-semibold text-sm w-12 text-right shrink-0">{item.percentual.toFixed(0)}%</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function MetasDashboardPage() {
  return (
    <AppShell>
      <ConteudoMetas />
    </AppShell>
  );
}
