"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, History, Ticket, Pencil, Trash2, Plus, X, AlertTriangle } from "lucide-react";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import CurrencyInput from "../../components/CurrencyInput";
import BotaoAtualizar from "../../components/BotaoAtualizar";
import FormasPagamentoModal from "../../components/FormasPagamentoModal";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { hojeBrasil } from "../../lib/fusoHorario";
import { podeVerTodasUnidades, podeExcluirLancamento } from "../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR } from "../../lib/formato";
import { FORMAS_PAGAMENTO, precisaParcelas as precisaParcelasFn, precisaBandeira as precisaBandeiraFn } from "../../lib/formasPagamento";

let proximoIdLinhaCr = 1;
function gerarIdLinhaCr() {
  return proximoIdLinhaCr++;
}

function horasDesde(dataISO) {
  return (Date.now() - new Date(dataISO + "T00:00:00").getTime()) / 3600000;
}

function ConteudoContasAReceber() {
  const { usuario, unidades, linhaFiltro } = useSessao();
  const [linhas, setLinhas] = useState([]);
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [selecionada, setSelecionada] = useState(null);
  const [valorAgora, setValorAgora] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [formasPagamentoPopup, setFormasPagamentoPopup] = useState([]);
  const [mostrarModalFormasPopup, setMostrarModalFormasPopup] = useState(false);
  const [linhaEditandoPopup, setLinhaEditandoPopup] = useState(null);
  const snapshotEdicaoPopupRef = useRef(null);
  const [lembretesAbertos, setLembretesAbertos] = useState(false);
  const [lembretesMostrados, setLembretesMostrados] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [processandoExclusao, setProcessandoExclusao] = useState(false);
  const [unidadeExpandida, setUnidadeExpandida] = useState(null); // { id, nome } — pop-up de resumo por unidade
  const podeExcluir = podeExcluirLancamento(usuario.cargo);
  const unidadesMap = Object.fromEntries(unidades.map((u) => [u.id, u.nome]));
  const mostrarUnidade = podeVerTodasUnidades(usuario.cargo) || unidades.length > 1;

  async function carregar() {
    if (unidades.length === 0) return [];
    let query = supabase
      .from("vw_contas_a_receber")
      .select("*")
      .in("unidade_id", unidades.map((u) => u.id))
      .order("falta_pagar", { ascending: false });
    if (linhaFiltro) query = query.eq("linha", linhaFiltro);
    const { data } = await query;
    setLinhas(data || []);
    return data || [];
  }

  useEffect(() => {
    carregar();
  }, [unidades, linhaFiltro]); // eslint-disable-line react-hooks/exhaustive-deps

  // lembretes: OS com mais de 24h em aberto — abre automaticamente 1x por dia
  const lembretes = linhas.filter((l) => horasDesde(l.ultimo_lancamento) >= 24);
  useEffect(() => {
    if (lembretesMostrados || lembretes.length === 0) return;
    const chave = `lembrete-contas-receber-${hojeBrasil()}`;
    if (!window.localStorage.getItem(chave)) {
      setLembretesAbertos(true);
      window.localStorage.setItem(chave, "1");
    }
    setLembretesMostrados(true);
  }, [lembretes, lembretesMostrados]);

  const linhasFiltradas = filtroUnidade ? linhas.filter((l) => l.unidade_id === filtroUnidade) : linhas;
  const totalOrcamento = linhasFiltradas.reduce((s, l) => s + Number(l.orcamento_aprovado), 0);
  const totalFalta = linhasFiltradas.reduce((s, l) => s + Number(l.falta_pagar), 0);
  const percentualFalta = totalOrcamento ? (totalFalta / totalOrcamento) * 100 : 0;

  // resumo por unidade — só pra quem tem acesso a mais de uma unidade e está
  // olhando "todas" (sem escolher uma específica no filtro)
  const mostrarResumoUnidades = unidades.length > 1 && !filtroUnidade;
  const resumoPorUnidade = unidades
    .map((u) => {
      const doUnidade = linhas.filter((l) => l.unidade_id === u.id);
      return {
        id: u.id,
        nome: u.nome,
        orcamento: doUnidade.reduce((s, l) => s + Number(l.orcamento_aprovado), 0),
        pago: doUnidade.reduce((s, l) => s + Number(l.total_pago), 0),
        falta: doUnidade.reduce((s, l) => s + Number(l.falta_pagar), 0),
        qtdOs: doUnidade.length,
      };
    })
    .filter((u) => u.qtdOs > 0)
    .sort((a, b) => b.falta - a.falta);
  const linhasDaUnidadeExpandida = unidadeExpandida ? linhas.filter((l) => l.unidade_id === unidadeExpandida.id) : [];

  async function carregarHistorico(unidadeId, numeroOs, tipoServicoId, linhaCiIh) {
    setCarregandoHistorico(true);
    const { data } = await supabase
      .from("lancamentos")
      .select("id, data, valor_pago, forma_pagamento, formas_pagamento, usuarios!atendente_id(nome_completo)")
      .eq("unidade_id", unidadeId)
      .eq("numero_os", numeroOs)
      .eq("tipo_servico_id", tipoServicoId)
      .eq("linha", linhaCiIh)
      .order("criado_em", { ascending: true });
    setHistorico(data || []);
    setCarregandoHistorico(false);
  }

  function abrirPopup(linha) {
    setSelecionada(linha);
    setValorAgora(Number(linha.falta_pagar));
    setFormaPagamento("");
    setFormasPagamentoPopup([]);
    setLinhaEditandoPopup(null);
    carregarHistorico(linha.unidade_id, linha.numero_os, linha.tipo_servico_id, linha.linha);
  }

  function fecharPopup() {
    setSelecionada(null);
    setHistorico([]);
    setFormasPagamentoPopup([]);
    setLinhaEditandoPopup(null);
    setExcluindo(false);
    setMotivoExclusao("");
  }

  async function confirmarExclusaoConta() {
    if (!motivoExclusao.trim() || !selecionada) return;
    setProcessandoExclusao(true);
    const ids = historico.map((h) => h.id);
    // primeiro grava o motivo em cada lançamento (fica no log de auditoria), depois exclui de fato
    const { error: erroMotivo } = await supabase
      .from("lancamentos")
      .update({ motivo_exclusao: motivoExclusao.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
      .in("id", ids);
    if (erroMotivo) {
      alert("Erro ao registrar o motivo: " + erroMotivo.message);
      setProcessandoExclusao(false);
      return;
    }
    const { error } = await supabase.from("lancamentos").delete().in("id", ids);
    setProcessandoExclusao(false);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    fecharPopup();
    carregar();
  }

  async function confirmarPagamento() {
    if (!selecionada) return;
    const usaMultiplas = formasPagamentoPopup.length > 0;
    if (usaMultiplas && linhaEditandoPopup !== null) {
      alert("Finalize a edição da forma de pagamento antes de salvar.");
      return;
    }
    if (!usaMultiplas && !formaPagamento) {
      alert("Selecione a forma de pagamento.");
      return;
    }
    const totalFormas = formasPagamentoPopup.reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const valorEfetivo = usaMultiplas ? totalFormas : Number(valorAgora) || 0;
    if (valorEfetivo <= 0) {
      alert("Informe o valor recebido.");
      return;
    }
    if (valorEfetivo > Number(selecionada.falta_pagar) + 0.001) {
      alert(`O valor não pode ser maior que o saldo em aberto: R$ ${formatarMoedaSemSimbolo(selecionada.falta_pagar)}.`);
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("lancamentos").insert({
      unidade_id: selecionada.unidade_id,
      data: hojeBrasil(),
      numero_os: selecionada.numero_os,
      categoria_id: selecionada.categoria_id,
      modelo_id: selecionada.modelo_id,
      tipo_servico_id: selecionada.tipo_servico_id,
      linha: selecionada.linha,
      orcamento_aprovado: Number(selecionada.orcamento_aprovado),
      valor_pago: valorEfetivo,
      forma_pagamento: usaMultiplas ? "MÚLTIPLAS" : formaPagamento,
      formas_pagamento: usaMultiplas ? formasPagamentoPopup.map(({ id, ...resto }) => resto) : null,
      atendente_id: usuario.id,
      criado_por: usuario.id,
    });
    setSalvando(false);
    if (error) {
      alert("Erro ao registrar: " + error.message);
      return;
    }

    await carregar();
    fecharPopup();
  }

  function aoSalvarModalFormasPopup(formas) {
    setFormasPagamentoPopup(formas.map((f) => ({ ...f, id: gerarIdLinhaCr() })));
    setMostrarModalFormasPopup(false);
    setLinhaEditandoPopup(null);
    setValorAgora("");
    setFormaPagamento("");
  }

  function usarFormaUnicaPopup() {
    if (formasPagamentoPopup.length > 0 && !window.confirm("Remover as formas de pagamento já preenchidas e voltar a usar apenas uma?")) return;
    setFormasPagamentoPopup([]);
    setLinhaEditandoPopup(null);
  }

  function adicionarLinhaInlinePopup() {
    const nova = { id: gerarIdLinhaCr(), valor: "", forma_pagamento: "", parcelas: null, bandeira: null };
    setFormasPagamentoPopup((fs) => [...fs, nova]);
    snapshotEdicaoPopupRef.current = nova;
    setLinhaEditandoPopup(nova.id);
  }

  function atualizarCampoLinhaPopup(id, campo, valor) {
    setFormasPagamentoPopup((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function iniciarEdicaoLinhaPopup(entry) {
    snapshotEdicaoPopupRef.current = entry;
    setLinhaEditandoPopup(entry.id);
  }

  function cancelarEdicaoLinhaPopup() {
    const snap = snapshotEdicaoPopupRef.current;
    if (snap) {
      if (!snap.forma_pagamento && !snap.valor) {
        setFormasPagamentoPopup((fs) => fs.filter((f) => f.id !== snap.id));
      } else {
        setFormasPagamentoPopup((fs) => fs.map((f) => (f.id === snap.id ? snap : f)));
      }
    }
    setLinhaEditandoPopup(null);
    snapshotEdicaoPopupRef.current = null;
  }

  function salvarEdicaoLinhaPopup(entry) {
    if (!entry.valor || Number(entry.valor) <= 0 || !entry.forma_pagamento) {
      alert("Preencha o valor e a forma de pagamento antes de salvar esta linha.");
      return;
    }
    setLinhaEditandoPopup(null);
    snapshotEdicaoPopupRef.current = null;
  }

  function excluirLinhaPopup(id) {
    if (!window.confirm("Remover esta forma de pagamento?")) return;
    setFormasPagamentoPopup((fs) => fs.filter((f) => f.id !== id));
    if (linhaEditandoPopup === id) {
      setLinhaEditandoPopup(null);
      snapshotEdicaoPopupRef.current = null;
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Contas a receber</h1>
        </div>
        <div className="flex items-center gap-2">
          <BotaoAtualizar aoAtualizar={carregar} />
          <button onClick={() => setLembretesAbertos(true)} className="relative btn w-10 h-10 p-0" title="Lembretes de cobrança">
            <Bell size={16} />
            {lembretes.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">
                {lembretes.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {mostrarUnidade && (
        <div className="mb-4 flex items-center gap-2">
          <span className="field-label mb-0">Unidade:</span>
          <select className="field-input w-56" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
            <option value="">Todas as unidades</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Total a receber</p>
          <p className="font-mono-num text-xl font-semibold text-bronze">R$ {formatarMoedaSemSimbolo(totalFalta)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">% do orçamento total</p>
          <p className="font-mono-num text-xl font-semibold text-ink">{percentualFalta.toFixed(1)}%</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">OS em aberto</p>
          <p className="font-mono-num text-xl font-semibold text-ink">{linhasFiltradas.length}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {mostrarResumoUnidades ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                <td className="p-3">Unidade</td>
                <td className="p-3 text-right">Orçamento</td>
                <td className="p-3 text-right"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
                <td className="p-3 text-right">Falta pagar</td>
                <td className="p-3 text-right">OS em aberto</td>
              </tr>
            </thead>
            <tbody>
              {resumoPorUnidade.length === 0 && (
                <tr><td className="p-4 text-muted" colSpan={5}>Nenhuma OS em aberto.</td></tr>
              )}
              {resumoPorUnidade.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                  onClick={() => setUnidadeExpandida({ id: u.id, nome: u.nome })}
                >
                  <td className="p-3 font-medium">{u.nome}</td>
                  <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(u.orcamento)}</td>
                  <td className="p-3 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5">R$ {formatarMoedaSemSimbolo(u.pago)}</td>
                  <td className="p-3 text-right font-mono-num font-bold text-bronze bg-bronze/5">R$ {formatarMoedaSemSimbolo(u.falta)}</td>
                  <td className="p-3 text-right font-mono-num text-muted">{u.qtdOs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              {mostrarUnidade && <td className="p-3">Unidade</td>}
              <td className="p-3">Nº OS</td>
              <td className="p-3">Tipo de serviço</td>
              <td className="p-3 text-right">Orçamento</td>
              <td className="p-3 text-right"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
              <td className="p-3 text-right">Falta pagar</td>
              <td className="p-3">Último lançamento</td>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.length === 0 && (
              <tr><td className="p-4 text-muted" colSpan={mostrarUnidade ? 7 : 6}>Nenhuma OS em aberto.</td></tr>
            )}
            {linhasFiltradas.map((l) => (
              <tr
                key={`${l.unidade_id}-${l.numero_os}-${l.tipo_servico_id}-${l.linha}`}
                className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                onClick={() => abrirPopup(l)}
              >
                {mostrarUnidade && <td className="p-3">{unidadesMap[l.unidade_id]}</td>}
                <td className="p-3 font-mono-num">{l.numero_os}</td>
                <td className="p-3 text-xs text-muted">
                  {l.tipo_servico_nome || "—"}{" "}
                  {l.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                </td>
                <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                <td className="p-3 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5">R$ {formatarMoedaSemSimbolo(l.total_pago)}</td>
                <td className="p-3 text-right font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</td>
                <td className="p-3 text-muted">{formatarDataBR(l.ultimo_lancamento)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {unidadeExpandida && (
        <Modal titulo={unidadeExpandida.nome} subtitulo={`${linhasDaUnidadeExpandida.length} OS em aberto`} onFechar={() => setUnidadeExpandida(null)} largura="max-w-3xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                <td className="pb-2">Nº OS</td>
                <td className="pb-2">Tipo de serviço</td>
                <td className="pb-2 text-right">Orçamento</td>
                <td className="pb-2 text-right"><span className="text-[#3F8A5C] font-bold bg-[#3F8A5C]/10 rounded px-2 py-0.5">Pago</span></td>
                <td className="pb-2 text-right">Falta pagar</td>
                <td className="pb-2">Último lançamento</td>
              </tr>
            </thead>
            <tbody>
              {linhasDaUnidadeExpandida.map((l) => (
                <tr
                  key={`${l.unidade_id}-${l.numero_os}-${l.tipo_servico_id}-${l.linha}`}
                  className="border-t border-line hover:bg-canvas/60 cursor-pointer"
                  onClick={() => {
                    setUnidadeExpandida(null);
                    abrirPopup(l);
                  }}
                >
                  <td className="py-2 font-mono-num">{l.numero_os}</td>
                  <td className="py-2 text-xs text-muted">
                    {l.tipo_servico_nome || "—"}{" "}
                    {l.linha === "ih" && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>
                    )}
                  </td>
                  <td className="py-2 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.orcamento_aprovado)}</td>
                  <td className="py-2 text-right font-mono-num font-bold text-[#2E6B45] bg-[#3F8A5C]/5">R$ {formatarMoedaSemSimbolo(l.total_pago)}</td>
                  <td className="py-2 text-right font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</td>
                  <td className="py-2 text-muted">{formatarDataBR(l.ultimo_lancamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal>
      )}

      {selecionada && (
        <Modal
          titulo={`OS ${selecionada.numero_os}`}
          subtitulo={`${mostrarUnidade ? unidadesMap[selecionada.unidade_id] + " — " : ""}${selecionada.tipo_servico_nome || "Quitar saldo em aberto"}`}
          onFechar={fecharPopup}
          largura="max-w-xl"
        >
          {excluindo ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p>
                  Você está prestes a excluir permanentemente o registro da OS{" "}
                  <span className="font-mono-num font-medium">{selecionada.numero_os}</span> do Contas a Receber
                  (orçamento de <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.orcamento_aprovado)}</span>, sem nenhum valor pago). Essa ação não pode ser desfeita.
                </p>
              </div>
              <div>
                <label className="field-label">Motivo da exclusão (obrigatório)</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={motivoExclusao}
                  onChange={(e) => setMotivoExclusao(e.target.value)}
                  placeholder="Ex: cliente desistiu, orçamento cadastrado por engano, etc."
                />
                <p className="text-xs text-muted mt-1">O motivo fica registrado no log do sistema, junto com os dados excluídos.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setExcluindo(false)}>Cancelar</button>
                <button
                  className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
                  disabled={!motivoExclusao.trim() || processandoExclusao}
                  onClick={confirmarExclusaoConta}
                >
                  <Trash2 size={14} /> {processandoExclusao ? "Excluindo…" : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted">Orçamento</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.orcamento_aprovado)}</p></div>
              <div><p className="text-xs text-muted">Já pago</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionada.total_pago)}</p></div>
              <div><p className="text-xs text-muted">Falta pagar</p><p className="font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(selecionada.falta_pagar)}</p></div>
            </div>

            {podeExcluir && Number(selecionada.total_pago) === 0 && (
              <button
                className="text-xs text-danger hover:underline flex items-center gap-1"
                onClick={() => setExcluindo(true)}
              >
                <Trash2 size={12} /> Excluir este registro do Contas a Receber
              </button>
            )}

            <div>
              <p className="field-label flex items-center gap-1.5 mb-1.5"><History size={12} /> O que já foi lançado nessa OS</p>
              {carregandoHistorico ? (
                <p className="text-sm text-muted">Carregando…</p>
              ) : historico.length === 0 ? (
                <p className="text-sm text-muted">Nenhum lançamento anterior.</p>
              ) : (
                <div className="card divide-y divide-line max-h-40 overflow-y-auto">
                  {historico.map((h) => (
                    <div key={h.id} className="px-3 py-2 flex items-center justify-between text-sm">
                      <div>
                        <span className="text-muted">{formatarDataBR(h.data)}</span>{" "}
                        <span className="text-xs text-muted">— {h.usuarios?.nome_completo || "—"}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(h.valor_pago)}</span>{" "}
                        <span className="text-xs text-muted bg-canvas px-1.5 py-0.5 rounded ml-1">
                          {h.forma_pagamento === "MÚLTIPLAS" ? `${(h.formas_pagamento || []).length} formas` : h.forma_pagamento || "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-line pt-4">
              <p className="field-label mb-1.5">Registrar novo pagamento</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Valor a receber agora</label>
                  {formasPagamentoPopup.length > 0 ? (
                    <CurrencyInput valor={formasPagamentoPopup.reduce((s, f) => s + (Number(f.valor) || 0), 0)} disabled />
                  ) : (
                    <CurrencyInput valor={valorAgora} onChange={setValorAgora} />
                  )}
                </div>
                <div>
                  <label className="field-label">Forma de pagamento</label>
                  {formasPagamentoPopup.length > 0 ? (
                    <div className="field-input flex items-center justify-between bg-canvas">
                      <span className="text-sm text-ink">Múltiplas formas</span>
                      <button type="button" onClick={usarFormaUnicaPopup} className="text-xs text-muted hover:text-danger transition flex items-center gap-1">
                        <X size={12} /> usar 1 forma
                      </button>
                    </div>
                  ) : (
                    <div>
                      <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                        <option value="">Selecione</option>
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setMostrarModalFormasPopup(true)}
                        className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white
                          bg-gradient-to-b from-gold to-gold-strong shadow-sm hover:brightness-105 hover:-translate-y-px active:translate-y-0 transition-all"
                      >
                        <Ticket size={13} /> Dividir em mais de uma forma
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {formasPagamentoPopup.length > 0 && (
                <div className="mt-3">
                  <div className="card divide-y divide-line">
                    {formasPagamentoPopup.map((f) =>
                      linhaEditandoPopup === f.id ? (
                        <div key={f.id} className="p-3">
                          <div className="flex items-start gap-2">
                            <div className="w-28 shrink-0">
                              <label className="field-label">Valor</label>
                              <CurrencyInput valor={f.valor} onChange={(v) => atualizarCampoLinhaPopup(f.id, "valor", v)} />
                            </div>
                            <div className="flex-1">
                              <label className="field-label">Forma</label>
                              <select className="field-input" value={f.forma_pagamento} onChange={(e) => atualizarCampoLinhaPopup(f.id, "forma_pagamento", e.target.value)}>
                                <option value="">Selecione</option>
                                {FORMAS_PAGAMENTO.map((fp) => (
                                  <option key={fp} value={fp}>{fp}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button type="button" className="btn text-xs" onClick={cancelarEdicaoLinhaPopup}>Cancelar</button>
                            <button type="button" className="btn-primary text-xs" onClick={() => salvarEdicaoLinhaPopup(f)}>Salvar</button>
                          </div>
                        </div>
                      ) : (
                        <div key={f.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-mono-num font-medium">R$ {Number(f.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                            <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{f.forma_pagamento}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button type="button" title="Alterar" onClick={() => iniciarEdicaoLinhaPopup(f)} className="text-muted hover:text-gold transition p-1">
                              <Pencil size={14} />
                            </button>
                            <button type="button" title="Excluir" onClick={() => excluirLinhaPopup(f.id)} className="text-muted hover:text-danger transition p-1">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                  <button type="button" onClick={adicionarLinhaInlinePopup} className="btn text-xs flex items-center gap-1.5 mt-2">
                    <Plus size={13} /> Adicionar outra forma de pagamento
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn" onClick={fecharPopup}>Fechar</button>
              <button className="btn-primary" onClick={confirmarPagamento} disabled={salvando}>
                {salvando ? "Salvando…" : "Registrar recebimento"}
              </button>
            </div>
          </div>
          )}
        </Modal>
      )}

      <FormasPagamentoModal
        aberto={mostrarModalFormasPopup}
        formasIniciais={[]}
        onFechar={() => setMostrarModalFormasPopup(false)}
        onSalvar={aoSalvarModalFormasPopup}
      />

      {lembretesAbertos && (
        <Modal
          titulo="Lembretes de cobrança"
          subtitulo={`${lembretes.length} OS com mais de 24h em aberto`}
          onFechar={() => setLembretesAbertos(false)}
        >
          {lembretes.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma pendência com mais de 24h no momento. 🎉</p>
          ) : (
            <div className="space-y-3">
              {lembretes.map((l) => (
                <div key={`${l.unidade_id}-${l.numero_os}-${l.tipo_servico_id}-${l.linha}`} className="rounded-lg border border-line p-3 text-sm">
                  <p className="text-ink">
                    A OS <span className="font-mono-num font-medium">{l.numero_os}</span>
                    {l.tipo_servico_nome && <> ({l.tipo_servico_nome})</>}
                    {mostrarUnidade && <> — {unidadesMap[l.unidade_id]}</>} está com{" "}
                    <span className="font-mono-num font-medium text-bronze">R$ {formatarMoedaSemSimbolo(l.falta_pagar)}</span> em
                    aberto desde <span className="font-medium">{formatarDataBR(l.ultimo_lancamento)}</span>. Entre em contato com o
                    cliente para efetuar a cobrança.
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function ContasAReceber() {
  return (
    <AppShell>
      <ConteudoContasAReceber />
    </AppShell>
  );
}
