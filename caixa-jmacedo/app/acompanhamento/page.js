"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Store } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from "recharts";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { formatarCompacto, formatarMoedaSemSimbolo } from "../../lib/formato";

const PALETA = ["#2670B5", "#3F8A5C", "#9C5A34", "#7C818C", "#9B7BC9", "#D97AA0", "#C9A227", "#0E5A56"];
const MODOS = [
  { id: "diario", rotulo: "Diário" },
  { id: "semanal", rotulo: "Semanal" },
  { id: "mensal", rotulo: "Mensal" },
];

function aISO(d) {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

// semana domingo → sábado
function inicioDaSemana(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay()); // getDay(): domingo = 0
  return d;
}

function numeroSemanaDomingo(data) {
  const inicioAno = new Date(data.getFullYear(), 0, 1);
  const inicioSemanaAno = inicioDaSemana(inicioAno);
  const inicioSemanaAtual = inicioDaSemana(data);
  const diffDias = Math.round((inicioSemanaAtual - inicioSemanaAno) / 86400000);
  return Math.floor(diffDias / 7) + 1;
}

const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function gerarBaldes(modo) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const baldes = [];

  if (modo === "diario") {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      const fim = new Date(d);
      fim.setDate(fim.getDate() + 1);
      baldes.push({ inicioStr: aISO(d), fimStr: aISO(fim), rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) });
    }
  } else if (modo === "semanal") {
    const semanaAtual = inicioDaSemana(hoje);
    for (let i = 11; i >= 0; i--) {
      const inicio = new Date(semanaAtual);
      inicio.setDate(inicio.getDate() - i * 7);
      const fim = new Date(inicio);
      fim.setDate(fim.getDate() + 7);
      baldes.push({ inicioStr: aISO(inicio), fimStr: aISO(fim), rotulo: `W${numeroSemanaDomingo(inicio)}` });
    }
  } else {
    for (let i = 11; i >= 0; i--) {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 1);
      baldes.push({ inicioStr: aISO(inicio), fimStr: aISO(fim), rotulo: `${MESES_ABREV[inicio.getMonth()]}/${String(inicio.getFullYear()).slice(2)}` });
    }
  }
  return baldes;
}

function Conteudo() {
  const { unidades } = useSessao();
  const [modo, setModo] = useState("semanal");
  const [selecionadas, setSelecionadas] = useState([]);
  const [popupUnidades, setPopupUnidades] = useState(false);
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (unidades.length && selecionadas.length === 0) {
      setSelecionadas(unidades.slice(0, 5).map((u) => u.id));
    }
  }, [unidades]); // eslint-disable-line react-hooks/exhaustive-deps

  const baldes = useMemo(() => gerarBaldes(modo), [modo]);

  useEffect(() => {
    if (selecionadas.length === 0 || baldes.length === 0) return;
    setCarregando(true);
    supabase
      .from("lancamentos")
      .select("unidade_id, data, valor_pago")
      .in("unidade_id", selecionadas)
      .gte("data", baldes[0].inicioStr)
      .then(({ data }) => {
        setLancamentos(data || []);
        setCarregando(false);
      });
  }, [selecionadas, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarUnidade(id) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
  }

  const dadosGrafico = useMemo(() => {
    return baldes.map((b) => {
      const linha = { rotulo: b.rotulo };
      selecionadas.forEach((unidadeId) => {
        const unidade = unidades.find((u) => u.id === unidadeId);
        const total = lancamentos
          .filter((l) => l.unidade_id === unidadeId && l.data >= b.inicioStr && l.data < b.fimStr)
          .reduce((s, l) => s + Number(l.valor_pago), 0);
        linha[unidade?.nome || unidadeId] = total;
      });
      return linha;
    });
  }, [baldes, lancamentos, selecionadas, unidades]);

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Acompanhamento</h1>
          <p className="text-sm text-muted mt-1">Valor vendido — visão {MODOS.find((m) => m.id === modo)?.rotulo.toLowerCase()}</p>
        </div>
        <button className="btn flex items-center gap-2" onClick={() => setPopupUnidades(true)}>
          <Store size={15} /> {selecionadas.length} unidade(s)
        </button>
      </div>

      <div className="flex gap-2 mb-5">
        {MODOS.map((m) => (
          <button
            key={m.id}
            onClick={() => setModo(m.id)}
            className={`px-4 py-1.5 rounded-full text-sm transition ${
              modo === m.id ? "bg-gold text-white font-medium" : "bg-white border border-line text-muted hover:border-gold/50"
            }`}
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      <div className="card p-5">
        {carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={dadosGrafico} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line-rgb))" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: "#6B6D76" }} />
              <YAxis tickFormatter={(v) => formatarCompacto(v)} tick={{ fontSize: 12, fill: "#6B6D76" }} width={50} />
              <Tooltip formatter={(v) => `R$ ${formatarMoedaSemSimbolo(v)}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {selecionadas.map((unidadeId, i) => {
                const unidade = unidades.find((u) => u.id === unidadeId);
                const nome = unidade?.nome || unidadeId;
                return (
                  <Line key={unidadeId} type="monotone" dataKey={nome} stroke={PALETA[i % PALETA.length]} strokeWidth={2} dot={{ r: 2.5 }}>
                    <LabelList dataKey={nome} position="top" formatter={(v) => (v ? formatarCompacto(v) : "")} fontSize={10} fill={PALETA[i % PALETA.length]} />
                  </Line>
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {popupUnidades && (
        <Modal titulo="Selecionar unidades" subtitulo="Escolha quais unidades aparecem no gráfico" onFechar={() => setPopupUnidades(false)}>
          <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {unidades.map((u) => {
              const marcado = selecionadas.includes(u.id);
              return (
                <label key={u.id} className={`checkbox-tile ${marcado ? "is-checked" : ""}`}>
                  <input type="checkbox" checked={marcado} onChange={() => alternarUnidade(u.id)} className="sr-only" />
                  <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${marcado ? "bg-gold border-gold" : "border-line bg-white"}`}>
                    {marcado && <Check size={12} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className="truncate">{u.nome}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end mt-4">
            <button className="btn-primary" onClick={() => setPopupUnidades(false)}>Aplicar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function AcompanhamentoPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
