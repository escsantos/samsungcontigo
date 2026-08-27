"use client";
import { useEffect, useState } from "react";
import { FileDown, Check, Store, CalendarDays, Wallet, Hash } from "lucide-react";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { hojeBrasil } from "../../lib/fusoHorario";
import { podeVerTodasUnidades } from "../../lib/permissions";
import { iconeCategoria } from "../../lib/iconesCategoria";
import { formatarDataBR, formatarMoedaSemSimbolo } from "../../lib/formato";

function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function paraCSV(linhas) {
  const cabecalho = ["Data", "Unidade", "Linha", "Nº OS", "Categoria", "Modelo", "Tipo de Serviço", "Orçamento Aprovado", "Valor Pago", "Forma de Pagamento", "Parcelas", "Bandeira", "Atendente"];
  const corpo = linhas.map((l) => [
    formatarDataBR(l.data),
    l.unidades?.nome || "",
    l.linha === "ih" ? "IH" : "CI",
    l.numero_os,
    l.categorias?.nome || "",
    l.modelos?.nome || "",
    l.tipos_servico?.nome || "",
    formatarMoedaSemSimbolo(l.orcamento_aprovado),
    formatarMoedaSemSimbolo(l.valor_pago),
    l.forma_pagamento,
    l.parcelas || "",
    l.bandeira || "",
    l.atendente?.nome_completo || "",
  ]);
  const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return [cabecalho, ...corpo].map((linha) => linha.map(escapar).join(";")).join("\n");
}

function Conteudo() {
  const { usuario, unidades, linhaFiltro } = useSessao();
  const [dataDe, setDataDe] = useState(inicioMes());
  const [dataAte, setDataAte] = useState(hojeBrasil());
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState([]);
  const [popupUnidades, setPopupUnidades] = useState(false);
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    if (unidades.length) setUnidadesSelecionadas(unidades.map((u) => u.id));
  }, [unidades]);

  function alternarUnidade(id) {
    setUnidadesSelecionadas((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
  }

  async function buscar() {
    setBuscando(true);
    let query = supabase
      .from("lancamentos")
      .select(
        "id, data, numero_os, orcamento_aprovado, valor_pago, forma_pagamento, parcelas, bandeira, linha, unidades(nome), categorias(nome), modelos(nome), tipos_servico(nome), atendente:usuarios!atendente_id(nome_completo)"
      )
      .in("unidade_id", unidadesSelecionadas)
      .gte("data", dataDe)
      .lte("data", dataAte)
      .order("data", { ascending: false })
      .limit(5000);
    if (linhaFiltro) query = query.eq("linha", linhaFiltro);
    const { data } = await query;
    setResultados(data || []);
    setBuscando(false);
  }

  function exportar() {
    const csv = "\uFEFF" + paraCSV(resultados); // BOM para o Excel abrir acentos corretamente
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-caixa-jmacedo-${dataDe}_a_${dataAte}.csv`;
    link.click();
  }

  const totalPago = resultados.reduce((s, r) => s + Number(r.valor_pago), 0);

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Relatórios</h1>
        <p className="text-sm text-muted mt-1">
          {podeVerTodasUnidades(usuario.cargo) ? "Acesso a todas as unidades" : "Restrito às suas unidades autorizadas"}
        </p>
      </div>

      <div className="card p-4 grid grid-cols-4 gap-3 mb-6 items-end">
        <div>
          <label className="field-label flex items-center gap-1.5"><CalendarDays size={12} className="text-muted" /> Data de</label>
          <input className="field-input" type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </div>
        <div>
          <label className="field-label flex items-center gap-1.5"><CalendarDays size={12} className="text-muted" /> Data até</label>
          <input className="field-input" type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>
        <div>
          <label className="field-label flex items-center gap-1.5"><Store size={12} className="text-muted" /> Unidades</label>
          <button type="button" className="btn w-full flex items-center justify-center gap-1.5" onClick={() => setPopupUnidades(true)}>
            <Store size={14} /> {unidadesSelecionadas.length} selecionada(s)
          </button>
        </div>
        <button className="btn-primary" onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando…" : "Gerar relatório"}
        </button>
      </div>

      {resultados.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="card overflow-hidden">
              <div className="h-1.5 bg-[#3F8A5C]" />
              <div className="p-4">
                <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><Wallet size={16} /></div>
                <p className="text-xs text-muted mb-1">Total pago no período</p>
                <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalPago)}</p>
              </div>
            </div>
            <div className="card overflow-hidden">
              <div className="h-1.5 bg-[#7C819C]" />
              <div className="p-4">
                <div className="w-8 h-8 rounded-lg bg-[#7C819C]/10 flex items-center justify-center text-[#7C819C] mb-2"><Hash size={16} /></div>
                <p className="text-xs text-muted mb-1">Lançamentos encontrados</p>
                <p className="font-mono-num text-xl font-semibold text-ink">{resultados.length}</p>
              </div>
            </div>
            <div className="card overflow-hidden flex items-center justify-end p-4">
              <button className="btn flex items-center gap-1.5" onClick={exportar}>
                <FileDown size={14} /> Exportar para Excel (CSV)
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                  <td className="p-3 whitespace-nowrap">Data</td>
                  <td className="p-3 whitespace-nowrap">Unidade</td>
                  <td className="p-3 whitespace-nowrap">Nº OS</td>
                  <td className="p-3">Tipo de serviço</td>
                  <td className="p-3 text-right whitespace-nowrap">Orçamento</td>
                  <td className="p-3 text-right whitespace-nowrap">Pago</td>
                  <td className="p-3 whitespace-nowrap">Forma pgto.</td>
                  <td className="p-3">Atendente</td>
                </tr>
              </thead>
              <tbody>
                {resultados.slice(0, 200).map((r) => {
                  const Icone = iconeCategoria(r.categorias?.nome);
                  return (
                    <tr key={r.id} className="border-t border-line">
                      <td className="p-3 whitespace-nowrap">{formatarDataBR(r.data)}</td>
                      <td className="p-3 whitespace-nowrap max-w-[160px] truncate">{r.unidades?.nome}</td>
                      <td className="p-3 font-mono-num whitespace-nowrap">{r.numero_os}</td>
                      <td className="p-3 max-w-[220px] truncate">
                        <span className="inline-flex items-center gap-1.5">
                          <Icone size={13} className="text-muted shrink-0" />
                          {r.tipos_servico?.nome}
                          {r.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                        </span>
                      </td>
                      <td className="p-3 text-right font-mono-num whitespace-nowrap">R$ {formatarMoedaSemSimbolo(r.orcamento_aprovado)}</td>
                      <td className="p-3 text-right font-mono-num font-medium whitespace-nowrap">R$ {formatarMoedaSemSimbolo(r.valor_pago)}</td>
                      <td className="p-3 whitespace-nowrap">{r.forma_pagamento}</td>
                      <td className="p-3 max-w-[160px] truncate">{r.atendente?.nome_completo}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {resultados.length > 200 && (
              <p className="p-3 text-xs text-muted text-center border-t border-line">
                Mostrando 200 de {resultados.length} — exporte para Excel para ver todos.
              </p>
            )}
          </div>
        </>
      )}

      {popupUnidades && (
        <Modal titulo="Selecionar unidades" onFechar={() => setPopupUnidades(false)}>
          <div className="grid grid-cols-3 gap-2 max-h-96 overflow-y-auto">
            {unidades.map((u) => {
              const marcado = unidadesSelecionadas.includes(u.id);
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

export default function RelatoriosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
