"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import AppShell from "../../components/AppShell";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { formatarCompacto, formatarMoedaSemSimbolo } from "../../lib/formato";

const PALETA = ["#B8862E", "#2E6DA8", "#3F8A5C", "#9C5A34", "#7C818C", "#9B7BC9", "#D97AA0", "#0E5A56"];

function inicioDaSemana(data) {
  const d = new Date(data);
  const diaSemana = (d.getDay() + 6) % 7; // segunda = 0
  d.setDate(d.getDate() - diaSemana);
  d.setHours(0, 0, 0, 0);
  return d;
}

function rotuloSemana(d) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Conteudo() {
  const { unidades } = useSessao();
  const [selecionadas, setSelecionadas] = useState([]);
  const [semanas, setSemanas] = useState(15);
  const [lancamentos, setLancamentos] = useState([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (unidades.length && selecionadas.length === 0) {
      setSelecionadas(unidades.slice(0, 5).map((u) => u.id));
    }
  }, [unidades]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selecionadas.length === 0) return;
    setCarregando(true);
    const desde = inicioDaSemana(new Date());
    desde.setDate(desde.getDate() - semanas * 7);
    supabase
      .from("lancamentos")
      .select("unidade_id, data, valor_pago")
      .in("unidade_id", selecionadas)
      .gte("data", desde.toISOString().slice(0, 10))
      .then(({ data }) => {
        setLancamentos(data || []);
        setCarregando(false);
      });
  }, [selecionadas, semanas]);

  function alternarUnidade(id) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
  }

  const dadosGrafico = useMemo(() => {
    const semanasOrdenadas = [];
    const hoje = inicioDaSemana(new Date());
    for (let i = semanas - 1; i >= 0; i--) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i * 7);
      semanasOrdenadas.push(d);
    }

    return semanasOrdenadas.map((inicioSemana) => {
      const fimSemana = new Date(inicioSemana);
      fimSemana.setDate(fimSemana.getDate() + 7);
      const linha = { semana: rotuloSemana(inicioSemana) };
      selecionadas.forEach((unidadeId) => {
        const unidade = unidades.find((u) => u.id === unidadeId);
        const total = lancamentos
          .filter((l) => l.unidade_id === unidadeId && new Date(l.data) >= inicioSemana && new Date(l.data) < fimSemana)
          .reduce((s, l) => s + Number(l.valor_pago), 0);
        linha[unidade?.nome || unidadeId] = total;
      });
      return linha;
    });
  }, [lancamentos, selecionadas, semanas, unidades]);

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Acompanhamento semanal</h1>
        <p className="text-sm text-muted mt-1">Valor pago por semana — últimas {semanas} semanas</p>
      </div>

      <div className="card p-4 mb-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="field-label mb-0">Semanas:</span>
          <button className="btn w-8 h-8 p-0" onClick={() => setSemanas((s) => Math.max(4, s - 1))}><Minus size={14} /></button>
          <span className="font-mono-num text-sm w-8 text-center">{semanas}</span>
          <button className="btn w-8 h-8 p-0" onClick={() => setSemanas((s) => Math.min(52, s + 1))}><Plus size={14} /></button>
        </div>
      </div>

      <div className="card p-4 mb-5">
        <p className="field-label mb-2">Unidades no gráfico</p>
        <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
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
      </div>

      <div className="card p-5">
        {carregando ? (
          <p className="text-sm text-muted py-16 text-center">Carregando…</p>
        ) : (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={dadosGrafico} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E4E3DD" />
              <XAxis dataKey="semana" tick={{ fontSize: 12, fill: "#6B6D76" }} />
              <YAxis tickFormatter={(v) => formatarCompacto(v)} tick={{ fontSize: 12, fill: "#6B6D76" }} width={50} />
              <Tooltip formatter={(v) => `R$ ${formatarMoedaSemSimbolo(v)}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {selecionadas.map((unidadeId, i) => {
                const unidade = unidades.find((u) => u.id === unidadeId);
                return (
                  <Line
                    key={unidadeId}
                    type="monotone"
                    dataKey={unidade?.nome || unidadeId}
                    stroke={PALETA[i % PALETA.length]}
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function AcompanhamentoSemanalPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
