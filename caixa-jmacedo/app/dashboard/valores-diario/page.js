"use client";
import { useEffect, useState } from "react";
import { Wallet, CheckCircle2, Clock, Percent, Hash, Lock, Info, Calendar, FileSpreadsheet, Printer } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import BotaoAcao3D from "../../../components/BotaoAcao3D";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../../lib/formato";
import { hojeBrasil } from "../../../lib/fusoHorario";
import { buscarValoresPorPeriodo, filtrarPorMarca } from "../../../lib/agregacaoValores";

function diaSeguinte(dataIso) {
  const d = new Date(dataIso + "T12:00:00");
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MEDALHA = ["text-gold", "text-prata", "text-bronze"];

function ConteudoDashboard() {
  const { unidades, linhaFiltro, marcasFiltro, detalharLinha } = useSessao();
  const [dataSelecionada, setDataSelecionada] = useState(hojeBrasil());
  const [linhas, setLinhas] = useState([]);
  const [lancamentosDetalhe, setLancamentosDetalhe] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const idsAutorizados = new Set(unidades.map((u) => u.id));
  const ehHoje = dataSelecionada === hojeBrasil();

  async function carregar() {
    setCarregando(true);
    const dados = filtrarPorMarca(await buscarValoresPorPeriodo(supabase, dataSelecionada, diaSeguinte(dataSelecionada), linhaFiltro, detalharLinha), marcasFiltro);
    const lista = dados.map((u) => ({ ...u, falta: Number(u.orcamento_aprovado) - Number(u.valor_pago) }));
    setLinhas(lista);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [linhaFiltro, marcasFiltro, detalharLinha, dataSelecionada]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPago = linhas.reduce((s, l) => s + Number(l.valor_pago), 0);
  const totalOrcamento = linhas.reduce((s, l) => s + Number(l.orcamento_aprovado), 0);
  const totalFalta = linhas.reduce((s, l) => s + l.falta, 0);
  const totalQtdOs = linhas.reduce((s, l) => s + Number(l.qtd_os), 0);
  const ordenadas = linhas.slice().sort((a, b) => Number(b.valor_pago) - Number(a.valor_pago));

  async function abrirDetalhe(unidade) {
    setDetalhe({ titulo: unidade.unidade_nome, unidadeId: unidade.unidade_id });
    if (!idsAutorizados.has(unidade.unidade_id)) return;
    setCarregandoDetalhe(true);
    let query = supabase
      .from("lancamentos")
      .select("id, data, numero_os, orcamento_aprovado, valor_pago, tipos_servico(nome)")
      .eq("unidade_id", unidade.unidade_id);
    if (unidade.linha) query = query.eq("linha", unidade.linha);
    query = query.eq("data", dataSelecionada).order("data", { ascending: false });
    const { data } = await query;
    setLancamentosDetalhe(data || []);
    setCarregandoDetalhe(false);
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const linhasExport = ordenadas.map((l, i) => ({
      "Posição": i + 1,
      Unidade: l.unidade_nome,
      Linha: l.linha === "ih" ? "IH" : "CI",
      Orçamento: Number(l.orcamento_aprovado),
      Pago: Number(l.valor_pago),
      "Falta pagar": Number(l.falta),
      "Qtd. OS": Number(l.qtd_os),
    }));
    const planilha = XLSX.utils.json_to_sheet(linhasExport);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Valores");
    XLSX.writeFile(livro, `valores-diario-${dataSelecionada}.xlsx`);
  }

  function imprimirTela() {
    window.print();
  }

  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Valores (Diário) — {formatarDataBR(dataSelecionada)}</h1>
          <p className="text-sm text-muted mt-1">Ranking de todas as unidades do grupo{ehHoje ? ", só de hoje." : "."}</p>
        </div>
        <div className="flex items-center gap-2 print:hidden shrink-0">
          <div className="relative">
            <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              type="date"
              className="field-input pl-8 py-2"
              value={dataSelecionada}
              max={hojeBrasil()}
              onChange={(e) => setDataSelecionada(e.target.value)}
            />
          </div>
          <BotaoAtualizar aoAtualizar={carregar} />
          <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportarExcel} cor="teal" disabled={ordenadas.length === 0} />
          <BotaoAcao3D icone={Printer} rotulo="Imprimir" onClick={imprimirTela} cor="ink" />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2670B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2670B5]/10 flex items-center justify-center text-[#2670B5] mb-2"><Wallet size={16} /></div>
            <p className="text-xs text-muted mb-1">Orçamento aprovado</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalOrcamento)}</p>
          </div>
        </div>
        <div className="card overflow-hidden border-2 border-[#3F8A5C]/50 shadow-[0_0_0_3px_rgba(63,138,92,0.08)]">
          <div className="h-1.5 bg-[#3F8A5C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><CheckCircle2 size={16} /></div>
            <p className="text-xs text-[#3F8A5C] font-semibold mb-1">Valor pago</p>
            <p className="font-mono-num text-xl font-bold text-[#2E6B45]">R$ {formatarMoedaSemSimbolo(totalPago)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#9C5A34]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#9C5A34]/10 flex items-center justify-center text-[#9C5A34] mb-2"><Clock size={16} /></div>
            <p className="text-xs text-muted mb-1">Falta pagar ({ehHoje ? "hoje" : "no dia"})</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C5A34]">R$ {formatarMoedaSemSimbolo(totalFalta)}</p>
            <p className="text-[10px] text-muted mt-1 leading-snug">Só das OS movimentadas nesse dia — para o total em aberto de tudo, veja Contas a Receber.</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">% recebido</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C7E13]">{totalOrcamento ? ((totalPago / totalOrcamento) * 100).toFixed(1) : "0.0"}%</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C819C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C819C]/10 flex items-center justify-center text-[#7C819C] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Qtd. de OS</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{totalQtdOs}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Unidade</td>
              <td className="p-3 text-right">Orçamento</td>
              <td className="p-3 text-right"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
              <td className="p-3 text-right">
                <span className="inline-flex items-center gap-1" title="Só considera o orçamento definido e o valor pago nesse dia — não é o saldo total em aberto dessas OS. Para o total, veja Contas a Receber.">
                  Falta pagar <Info size={11} className="text-muted" />
                </span>
              </td>
              <td className="p-3 text-right">Qtd. OS</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={5}>Carregando…</td></tr>}
            {!carregando && ordenadas.length === 0 && <tr><td className="p-4 text-muted" colSpan={5}>Nenhum lançamento nesse dia.</td></tr>}
            {ordenadas.map((l, i) => (
              <tr key={`${l.unidade_id}-${l.linha}`} className="border-t border-line hover:bg-canvas/60 cursor-pointer" onClick={() => abrirDetalhe(l)}>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={`text-xs font-semibold w-6 ${MEDALHA[i] || "text-muted"}`}>{i + 1}º</span>
                    {l.unidade_nome}
                    {l.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                    {!idsAutorizados.has(l.unidade_id) && <Lock size={12} className="text-muted" />}
                  </span>
                </td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                <td className="p-3 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                <td className="p-3 text-right font-mono-num text-muted">R$ {formatarMoedaSemSimbolo(l.falta)}</td>
                <td className="p-3 text-right font-mono-num text-muted">{l.qtd_os}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detalhe && (
        <Modal titulo={detalhe.titulo} subtitulo={`${lancamentosDetalhe.length} lançamento(s) nesse dia`} onFechar={() => setDetalhe(null)} largura="max-w-3xl">
          {!idsAutorizados.has(detalhe.unidadeId) ? (
            <div className="flex flex-col items-center text-center py-6 text-muted">
              <Lock size={22} className="mb-2 opacity-60" />
              <p className="text-sm">Você só pode ver o detalhe dos lançamentos da sua própria unidade.</p>
            </div>
          ) : carregandoDetalhe ? (
            <p className="text-sm text-muted py-6 text-center">Carregando…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                  <td className="pb-2">Data</td>
                  <td className="pb-2">OS</td>
                  <td className="pb-2">Tipo de serviço</td>
                  <td className="pb-2 text-right">Orçamento</td>
                  <td className="pb-2 text-right">Valor pago</td>
                </tr>
              </thead>
              <tbody>
                {lancamentosDetalhe.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-2">{formatarDataBR(l.data)}</td>
                    <td className="py-2 font-mono-num">{l.numero_os}</td>
                    <td className="py-2">{l.tipos_servico?.nome}</td>
                    <td className="py-2 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                    <td className="py-2 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                  </tr>
                ))}
                {lancamentosDetalhe.length === 0 && (
                  <tr><td colSpan={5} className="py-4 text-muted text-center">Nenhum lançamento.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function DashboardValoresDiarioPage() {
  return (
    <AppShell>
      <ConteudoDashboard />
    </AppShell>
  );
}
