"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const PERIODOS = [
  { chave: "total_dia", tipo: "unidade", rotulo: "Resultado do dia", tag: "Dia" },
  { chave: "total_semana", tipo: "unidade", rotulo: "Resultado da semana", tag: "Semana" },
  { chave: "total_mes", tipo: "unidade", rotulo: "Resultado do mês", tag: "Mês" },
  { chave: "total_vendido", tipo: "acessorios", rotulo: "Vendas de acessórios do mês", tag: "Acessórios" },
  { chave: "percentual", tipo: "meta", rotulo: "Progresso da meta do mês", tag: "Meta" },
];
const INTERVALO_MS = 20000;

const MEDALHAS = [
  { cor: "border-gold bg-gold-soft/50", texto: "text-gold-strong", rotulo: "1º lugar · ouro", barra: "#B8862E" },
  { cor: "border-prata bg-prata-soft/60", texto: "text-prata", rotulo: "2º lugar · prata", barra: "#7C819C" },
  { cor: "border-bronze bg-bronze-soft/60", texto: "text-bronze", rotulo: "3º lugar · bronze", barra: "#9C5A34" },
];

const CORES_UNIDADE = ["#2670B5", "#3F8A5C", "#9C5A34", "#7C819C", "#9B7BC9", "#D97AA0", "#C9A227", "#0E5A56", "#B8862E", "#4C94D6"];

function moeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}

function moedaCompacta(v) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(v || 0));
}

function BandeiraQuadriculada({ size = 18 }) {
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

export default function PainelTV() {
  const [unidadesRanking, setUnidadesRanking] = useState([]);
  const [acessorios, setAcessorios] = useState([]);
  const [periodoIdx, setPeriodoIdx] = useState(0);
  const [progresso, setProgresso] = useState(0);
  const intervaloRef = useRef(null);

  async function carregar() {
    const { data: painel } = await supabase.from("vw_painel_tv").select("*");
    setUnidadesRanking(painel || []);
    const { data: acess } = await supabase.from("vw_painel_acessorios").select("*").order("total_vendido", { ascending: false });
    setAcessorios(acess || []);
  }

  useEffect(() => {
    carregar();
    const recarrega = setInterval(carregar, 60000);
    return () => clearInterval(recarrega);
  }, []);

  useEffect(() => {
    let elapsed = 0;
    const passo = 200;
    intervaloRef.current = setInterval(() => {
      elapsed += passo;
      setProgresso(Math.min(100, (elapsed / INTERVALO_MS) * 100));
      if (elapsed >= INTERVALO_MS) {
        elapsed = 0;
        setPeriodoIdx((i) => (i + 1) % PERIODOS.length);
      }
    }, passo);
    return () => clearInterval(intervaloRef.current);
  }, []);

  const periodo = PERIODOS[periodoIdx];
  const ehAcessorios = periodo.tipo === "acessorios";
  const ehMeta = periodo.tipo === "meta";

  const comMeta = unidadesRanking.map((u) => ({
    ...u,
    percentual: Number(u.meta_mes) > 0 ? (Number(u.total_mes) / Number(u.meta_mes)) * 100 : null,
  }));

  const ordenadas = ehAcessorios
    ? [...acessorios].sort((a, b) => b.total_vendido - a.total_vendido)
    : ehMeta
    ? [...comMeta].sort((a, b) => {
        if (a.percentual === null && b.percentual === null) return a.unidade_nome.localeCompare(b.unidade_nome);
        if (a.percentual === null) return 1;
        if (b.percentual === null) return -1;
        return b.percentual - a.percentual;
      })
    : [...unidadesRanking].sort((a, b) => b[periodo.chave] - a[periodo.chave]);

  const top3 = ordenadas.slice(0, 3);
  const resto = ordenadas.slice(3);

  return (
    <div data-theme="claro" className="h-screen overflow-hidden bg-canvas text-ink px-[2vw] py-[2vh] font-body flex flex-col">
      <div className="flex justify-between items-center mb-[1.5vh] shrink-0">
        <div>
          <div className="flex gap-2 mb-[0.8vh]">
            {PERIODOS.map((p, i) => (
              <span
                key={p.chave}
                className={`text-[1.4vh] px-[1.2vh] py-[0.5vh] rounded-full transition ${
                  i === periodoIdx ? "bg-ink text-white font-medium" : "text-muted bg-white border border-line"
                }`}
              >
                {p.tag}
              </span>
            ))}
          </div>
          <h1 className="font-display text-[3.4vh] font-semibold leading-tight">{periodo.rotulo}</h1>
        </div>
        <div className="flex items-center gap-[2vh] shrink-0">
          <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo Eletrônica" className="w-auto" style={{ height: "16vh" }} />
          <div className="w-px self-stretch bg-line" />
          <img src="/logos/grupo-macedo-maschetti.png" alt="Grupo Macedo & Maschetti" className="w-auto" style={{ height: "16vh" }} />
        </div>
      </div>

      <div className="h-[0.6vh] bg-line rounded-full overflow-hidden mb-[2vh] shrink-0">
        <div className="h-full bg-gold transition-[width]" style={{ width: `${progresso}%` }} />
      </div>

      <div className="grid grid-cols-3 gap-[1.2vh] mb-[2vh] shrink-0">
        {top3.map((item, i) => (
          <div key={ehAcessorios ? `${item.usuario_id}-${item.unidade_id}` : item.unidade_id} className={`rounded-xl2 border-2 px-[2vh] py-[1.6vh] ${MEDALHAS[i]?.cor}`}>
            <p className={`text-[1.5vh] mb-[0.4vh] font-medium ${MEDALHAS[i]?.texto}`}>{MEDALHAS[i]?.rotulo}</p>
            <p className="font-display text-[2.2vh] font-semibold mb-[0.2vh] leading-tight">{ehAcessorios ? item.nome_completo : item.unidade_nome}</p>
            {ehAcessorios && <p className="text-[1.5vh] text-muted mb-[0.4vh]">{item.unidade_nome}</p>}

            {ehMeta ? (
              item.percentual === null ? (
                <>
                  <p className="font-display text-[2.4vh] font-semibold leading-none text-muted">— %</p>
                  <p className="text-[1.4vh] text-muted mt-[0.8vh]">Meta não definida</p>
                </>
              ) : (
                <>
                  <p className="font-mono-num text-[4vh] font-semibold leading-none">{item.percentual.toFixed(0)}%</p>
                  <div className="h-[0.9vh] bg-line rounded-full overflow-hidden mt-[0.8vh]">
                    <div
                      className="h-full rounded-full transition-[width]"
                      style={{ width: `${Math.min(100, item.percentual)}%`, background: MEDALHAS[i]?.barra }}
                    />
                  </div>
                  <p className="text-[1.4vh] text-muted mt-[0.6vh] font-mono-num">Meta: R$ {moedaCompacta(item.meta_mes)}</p>
                </>
              )
            ) : (
              <>
                <p className="font-mono-num text-[4vh] font-semibold leading-none">R$ {moeda(ehAcessorios ? item.total_vendido : item[periodo.chave])}</p>
                {ehAcessorios ? (
                  <p className="text-[1.4vh] text-muted mt-[0.6vh] font-mono-num">Prêmio 5%: R$ {moeda(item.premio)}</p>
                ) : (
                  periodo.chave === "total_mes" && item.meta_mes > 0 && (
                    <p className="text-[1.4vh] text-muted mt-[0.6vh] font-mono-num">{((item.total_mes / item.meta_mes) * 100).toFixed(0)}% da meta</p>
                  )
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {ordenadas.length === 0 ? (
        <div className="rounded-xl2 border border-line bg-white p-8 text-center text-muted flex-1 flex items-center justify-center">
          Sem dados neste período.
        </div>
      ) : ehMeta ? (
        <div className="grid grid-cols-2 gap-[1.2vh] flex-1 min-h-0">
          {[0, 1].map((coluna) => {
            const metade = Math.ceil(resto.length / 2);
            const itensColuna = resto.slice(coluna * metade, coluna * metade + metade);
            const offset = coluna * metade;
            if (itensColuna.length === 0) return <div key={coluna} />;
            return (
              <div key={coluna} className="rounded-xl2 border border-line bg-white overflow-y-auto flex flex-col h-full">
                {itensColuna.map((item, i) => {
                  const cor = CORES_UNIDADE[(offset + i + 3) % CORES_UNIDADE.length];
                  const semMeta = item.percentual === null;
                  const pct = semMeta ? 0 : Math.min(100, item.percentual);
                  return (
                    <div key={item.unidade_id} className="flex-1 flex items-center gap-[1vh] px-[1.6vh] border-t border-line first:border-t-0">
                      <span className="text-muted font-mono-num text-[1.6vh] w-[2.6vh] shrink-0">{offset + i + 4}º</span>
                      <span className={`text-[1.7vh] w-[15vh] shrink-0 truncate ${semMeta ? "text-muted" : ""}`}>{item.unidade_nome}</span>
                      {semMeta ? (
                        <div className="flex-1 flex items-center">
                          <span className="text-[1.5vh] text-muted italic">Meta não definida</span>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 flex items-center gap-[0.8vh]">
                            <div className="flex-1 h-[1.2vh] bg-canvas rounded-full overflow-hidden border border-line">
                              <div className="h-full rounded-full transition-[width]" style={{ width: `${pct}%`, background: cor }} />
                            </div>
                            <BandeiraQuadriculada size={13} />
                          </div>
                          <span className="font-mono-num text-[1.4vh] text-muted w-[6.5vh] text-right shrink-0">R$ {moedaCompacta(item.meta_mes)}</span>
                          <span className="font-mono-num font-semibold text-[1.6vh] w-[5vh] text-right shrink-0">{item.percentual.toFixed(0)}%</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-[1.2vh] flex-1 min-h-0">
          {[0, 1].map((coluna) => {
            const metade = Math.ceil(resto.length / 2);
            const itensColuna = resto.slice(coluna * metade, coluna * metade + metade);
            const offset = coluna * metade;
            if (itensColuna.length === 0) return <div key={coluna} />;
            return (
              <div key={coluna} className="rounded-xl2 border border-line bg-white overflow-y-auto flex flex-col h-full">
                {itensColuna.map((item, i) => (
                  <div
                    key={ehAcessorios ? `${item.usuario_id}-${item.unidade_id}` : item.unidade_id}
                    className="flex-1 flex items-center justify-between gap-3 px-[2vh] border-t border-line first:border-t-0"
                  >
                    <span className="text-muted font-mono-num text-[1.9vh] w-[3.5vh] shrink-0">{offset + i + 4}º</span>
                    <span className="text-[2vh] flex-1 truncate">
                      {ehAcessorios ? item.nome_completo : item.unidade_nome}
                      {ehAcessorios && <span className="text-muted text-[1.5vh] ml-2">{item.unidade_nome}</span>}
                    </span>
                    <span className="font-mono-num font-medium text-[2.1vh] shrink-0">R$ {moeda(ehAcessorios ? item.total_vendido : item[periodo.chave])}</span>
                    {ehAcessorios && <span className="font-mono-num text-muted text-[1.7vh] shrink-0">R$ {moeda(item.premio)}</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
