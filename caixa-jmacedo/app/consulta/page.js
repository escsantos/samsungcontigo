"use client";
import { useEffect, useRef, useState } from "react";
import { Search, X, FileDown, Pencil, SearchX, Trash2, AlertTriangle, Ticket, Plus, StickyNote } from "lucide-react";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import CurrencyInput from "../../components/CurrencyInput";
import FormasPagamentoModal from "../../components/FormasPagamentoModal";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { hojeBrasil } from "../../lib/fusoHorario";
import { podeAlterar, podeExcluirLancamento, podeLancarDataRetroativa } from "../../lib/permissions";
import { iconeCategoria } from "../../lib/iconesCategoria";
import { formatarDataBR, formatarMoedaSemSimbolo } from "../../lib/formato";
import { FORMAS_PAGAMENTO, BANDEIRAS, precisaParcelas as precisaParcelasFn, precisaBandeira as precisaBandeiraFn } from "../../lib/formasPagamento";
import { normalizarNumeroOS } from "../../lib/validacaoOS";
import { listaSemanasRecentes } from "../../lib/fusoHorario";

let proximoIdLinhaConsulta = 1;
function gerarIdLinhaConsulta() {
  return proximoIdLinhaConsulta++;
}

function Conteudo() {
  const { usuario, unidades, linhaFiltro } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [numeroOs, setNumeroOs] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [modoPeriodo, setModoPeriodo] = useState("intervalo"); // "intervalo" | "semana"
  const semanas = listaSemanasRecentes(16);
  const [semanaSelecionada, setSemanaSelecionada] = useState(semanas[0].valor);
  const [categoriaId, setCategoriaId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [editando, setEditando] = useState(false);
  const [edicao, setEdicao] = useState({});
  const [erroNumeroOs, setErroNumeroOs] = useState(null);
  const [tiposServicoEdicao, setTiposServicoEdicao] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState("");
  const [processandoExclusao, setProcessandoExclusao] = useState(false);
  const [formasPagamentoEdicao, setFormasPagamentoEdicao] = useState([]);
  const [mostrarModalFormasEdicao, setMostrarModalFormasEdicao] = useState(false);
  const [linhaEditandoEdicao, setLinhaEditandoEdicao] = useState(null);
  const snapshotEdicaoConsultaRef = useRef(null);
  const mostrarUnidade = unidades.length > 1;
  const unidadesVisiveis = unidades.filter((u) => (linhaFiltro === "ih" ? u.atende_ih : linhaFiltro === "ci" ? u.atende_ci : true));

  useEffect(() => {
    if (unidadeId && !unidadesVisiveis.some((u) => u.id === unidadeId)) {
      setUnidadeId("");
    }
  }, [linhaFiltro]); // eslint-disable-line react-hooks/exhaustive-deps
  const podeEditar = podeAlterar(usuario.cargo, usuario.linha);
  const podeEditarData = podeLancarDataRetroativa(usuario.cargo);
  const podeExcluir = podeExcluirLancamento(usuario.cargo);

  useEffect(() => {
    supabase.from("categorias").select("*").order("nome").then(({ data }) => setCategorias(data || []));
  }, []);

  async function buscar(e) {
    e.preventDefault();
    setBuscando(true);
    let query = supabase
      .from("lancamentos")
      .select(
        "id, data, numero_os, valor_pago, orcamento_aprovado, forma_pagamento, parcelas, bandeira, formas_pagamento, observacoes, linha, unidade_id, categoria_id, tipo_servico_id, atendente_id, unidades(nome), categorias(nome), tipos_servico(nome), usuarios!atendente_id(nome_completo)"
      )
      .in("unidade_id", unidadeId ? [unidadeId] : unidades.map((u) => u.id))
      .order("data", { ascending: false })
      .limit(300);

    if (linhaFiltro) query = query.eq("linha", linhaFiltro);
    if (numeroOs.trim()) query = query.ilike("numero_os", `%${numeroOs.trim().toUpperCase()}%`);
    if (modoPeriodo === "semana") {
      const semana = semanas.find((s) => s.valor === semanaSelecionada) || semanas[0];
      query = query.gte("data", semana.inicio).lte("data", semana.fim);
    } else {
      if (dataDe) query = query.gte("data", dataDe);
      if (dataAte) query = query.lte("data", dataAte);
    }
    if (categoriaId) query = query.eq("categoria_id", categoriaId);

    const { data } = await query;
    setResultados(data || []);
    setBuscando(false);
  }

  function limpar() {
    setNumeroOs("");
    setDataDe("");
    setDataAte("");
    setModoPeriodo("intervalo");
    setCategoriaId("");
    setUnidadeId("");
    setResultados(null);
  }

  async function exportar() {
    const XLSX = await import("xlsx");
    const linhasExport = resultados.map((l) => {
      const linha = {
        Data: formatarDataBR(l.data),
        ...(mostrarUnidade ? { Unidade: l.unidades?.nome || "" } : {}),
        "Nº OS": l.numero_os,
        Categoria: l.categorias?.nome || "",
        Linha: l.linha === "ih" ? "IH" : "CI",
        "Tipo de Serviço": l.tipos_servico?.nome || "",
        "Orçamento Aprovado": Number(l.orcamento_aprovado),
        "Valor Pago": Number(l.valor_pago),
        "Forma de Pagamento":
          l.forma_pagamento === "MÚLTIPLAS"
            ? (l.formas_pagamento || []).map((f) => `${f.forma_pagamento}: R$ ${formatarMoedaSemSimbolo(f.valor)}`).join(" / ")
            : l.forma_pagamento || "",
      };
      return linha;
    });
    const planilha = XLSX.utils.json_to_sheet(linhasExport);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Consulta");
    XLSX.writeFile(livro, `consulta-caixa-jmacedo-${hojeBrasil()}.xlsx`);
  }

  useEffect(() => {
    if (!edicao.categoria_id) {
      setTiposServicoEdicao([]);
      return;
    }
    supabase
      .from("tipos_servico")
      .select("*")
      .eq("categoria_id", edicao.categoria_id)
      .order("nome")
      .then(({ data }) => setTiposServicoEdicao(data || []));
  }, [edicao.categoria_id]); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirDetalhe(item) {
    setSelecionado(item);
    setEditando(false);
    setExcluindo(false);
    setMotivoExclusao("");
    setEdicao({
      data: item.data,
      numero_os: item.numero_os,
      categoria_id: item.categoria_id,
      tipo_servico_id: item.tipo_servico_id,
      orcamento_aprovado: Number(item.orcamento_aprovado),
      valor_pago: Number(item.valor_pago),
      forma_pagamento: item.forma_pagamento === "MÚLTIPLAS" ? "" : item.forma_pagamento || "",
      parcelas: item.parcelas || "",
      bandeira: item.bandeira || "",
      observacoes: item.observacoes || "",
    });
    setErroNumeroOs(null);
    setFormasPagamentoEdicao(
      item.formas_pagamento && item.formas_pagamento.length > 0
        ? item.formas_pagamento.map((f) => ({ ...f, id: gerarIdLinhaConsulta() }))
        : []
    );
    setMostrarModalFormasEdicao(false);
    setLinhaEditandoEdicao(null);
  }

  async function confirmarExclusao() {
    if (!motivoExclusao.trim()) return;
    setProcessandoExclusao(true);
    // primeiro grava o motivo (fica no log de auditoria), depois exclui de fato
    const { error: erroMotivo } = await supabase
      .from("lancamentos")
      .update({ motivo_exclusao: motivoExclusao.trim(), alterado_por: usuario.id, alterado_em: new Date().toISOString() })
      .eq("id", selecionado.id);
    if (erroMotivo) {
      alert("Erro ao registrar o motivo: " + erroMotivo.message);
      setProcessandoExclusao(false);
      return;
    }
    const { data, error } = await supabase.from("lancamentos").delete().eq("id", selecionado.id).select();
    setProcessandoExclusao(false);
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Não foi possível excluir — você não tem permissão para esta ação.");
      return;
    }
    setResultados((atual) => atual.filter((r) => r.id !== selecionado.id));
    setSelecionado(null);
  }

  async function salvarEdicao() {
    const usaMultiplas = formasPagamentoEdicao.length > 0;
    if (usaMultiplas && linhaEditandoEdicao !== null) {
      alert("Finalize a edição da forma de pagamento antes de salvar.");
      return;
    }
    if (!usaMultiplas && Number(edicao.valor_pago) > 0 && !edicao.forma_pagamento) {
      alert("Selecione a forma de pagamento.");
      return;
    }

    let numeroOsValidado = null;
    if (podeEditarData) {
      const resultado = normalizarNumeroOS(edicao.numero_os);
      if (!resultado.valido) {
        setErroNumeroOs(resultado.erro);
        return;
      }
      setErroNumeroOs(null);
      numeroOsValidado = resultado.valor;
    }

    if (!edicao.categoria_id || !edicao.tipo_servico_id) {
      alert("Selecione a categoria e o tipo de serviço.");
      return;
    }

    const totalFormas = formasPagamentoEdicao.reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const valorPagoEfetivo = usaMultiplas ? totalFormas : Number(edicao.valor_pago) || 0;

    setSalvando(true);
    const { error } = await supabase
      .from("lancamentos")
      .update({
        ...(podeEditarData && edicao.data ? { data: edicao.data } : {}),
        ...(podeEditarData && numeroOsValidado ? { numero_os: numeroOsValidado } : {}),
        categoria_id: edicao.categoria_id,
        tipo_servico_id: edicao.tipo_servico_id,
        orcamento_aprovado: Number(edicao.orcamento_aprovado) || 0,
        valor_pago: valorPagoEfetivo,
        forma_pagamento: usaMultiplas ? "MÚLTIPLAS" : (Number(edicao.valor_pago) > 0 ? edicao.forma_pagamento : null),
        parcelas: !usaMultiplas && precisaParcelasFn(edicao.forma_pagamento) && edicao.parcelas ? Number(edicao.parcelas) : null,
        bandeira: !usaMultiplas && precisaBandeiraFn(edicao.forma_pagamento) ? edicao.bandeira || null : null,
        formas_pagamento: usaMultiplas ? formasPagamentoEdicao.map(({ id, ...resto }) => resto) : null,
        observacoes: edicao.observacoes?.trim() || null,
        alterado_por: usuario.id,
        alterado_em: new Date().toISOString(),
      })
      .eq("id", selecionado.id);
    setSalvando(false);
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    const atualizado = {
      ...edicao,
      valor_pago: valorPagoEfetivo,
      forma_pagamento: usaMultiplas ? "MÚLTIPLAS" : (Number(edicao.valor_pago) > 0 ? edicao.forma_pagamento : null),
      formas_pagamento: usaMultiplas ? formasPagamentoEdicao.map(({ id, ...resto }) => resto) : null,
    };
    setResultados((atual) => atual.map((r) => (r.id === selecionado.id ? { ...r, ...atualizado } : r)));
    setEditando(false);
    setSelecionado(null);
  }

  function aoSalvarModalFormasEdicao(formas) {
    setFormasPagamentoEdicao(formas.map((f) => ({ ...f, id: gerarIdLinhaConsulta() })));
    setMostrarModalFormasEdicao(false);
    setLinhaEditandoEdicao(null);
    setEdicao((ed) => ({ ...ed, valor_pago: "", forma_pagamento: "", parcelas: "", bandeira: "" }));
  }

  function usarFormaUnicaEdicao() {
    if (formasPagamentoEdicao.length > 0 && !window.confirm("Remover as formas de pagamento já preenchidas e voltar a usar apenas uma?")) return;
    setFormasPagamentoEdicao([]);
    setLinhaEditandoEdicao(null);
  }

  function adicionarLinhaInlineEdicao() {
    const nova = { id: gerarIdLinhaConsulta(), valor: "", forma_pagamento: "", parcelas: null, bandeira: null };
    setFormasPagamentoEdicao((fs) => [...fs, nova]);
    snapshotEdicaoConsultaRef.current = nova;
    setLinhaEditandoEdicao(nova.id);
  }

  function atualizarCampoLinhaEdicao(id, campo, valor) {
    setFormasPagamentoEdicao((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function iniciarEdicaoLinhaEdicao(entry) {
    snapshotEdicaoConsultaRef.current = entry;
    setLinhaEditandoEdicao(entry.id);
  }

  function cancelarEdicaoLinhaEdicao() {
    const snap = snapshotEdicaoConsultaRef.current;
    if (snap) {
      if (!snap.forma_pagamento && !snap.valor) {
        setFormasPagamentoEdicao((fs) => fs.filter((f) => f.id !== snap.id));
      } else {
        setFormasPagamentoEdicao((fs) => fs.map((f) => (f.id === snap.id ? snap : f)));
      }
    }
    setLinhaEditandoEdicao(null);
    snapshotEdicaoConsultaRef.current = null;
  }

  function salvarEdicaoLinhaEdicao(entry) {
    if (!entry.valor || Number(entry.valor) <= 0 || !entry.forma_pagamento) {
      alert("Preencha o valor e a forma de pagamento antes de salvar esta linha.");
      return;
    }
    setLinhaEditandoEdicao(null);
    snapshotEdicaoConsultaRef.current = null;
  }

  function excluirLinhaEdicao(id) {
    if (!window.confirm("Remover esta forma de pagamento?")) return;
    setFormasPagamentoEdicao((fs) => fs.filter((f) => f.id !== id));
    if (linhaEditandoEdicao === id) {
      setLinhaEditandoEdicao(null);
      snapshotEdicaoConsultaRef.current = null;
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Consulta</h1>
        <p className="text-sm text-muted mt-1">Busque lançamentos por Nº da OS, data, categoria{mostrarUnidade && " ou unidade"}.</p>
      </div>

      <form onSubmit={buscar} className="card p-4 grid grid-cols-4 gap-3 mb-6 items-end">
        <div>
          <label className="field-label">Nº da OS</label>
          <input className="field-input" value={numeroOs} onChange={(e) => setNumeroOs(e.target.value.toUpperCase())} placeholder="Ex: O-00000015" />
        </div>
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="field-label mb-0">{modoPeriodo === "semana" ? "Semana" : "Data de / até"}</label>
            <button
              type="button"
              onClick={() => setModoPeriodo((m) => (m === "semana" ? "intervalo" : "semana"))}
              className="text-[11px] text-gold-strong hover:underline"
            >
              {modoPeriodo === "semana" ? "Usar intervalo de datas" : "Buscar por semana"}
            </button>
          </div>
          {modoPeriodo === "semana" ? (
            <select className="field-input" value={semanaSelecionada} onChange={(e) => setSemanaSelecionada(e.target.value)}>
              {semanas.map((s) => (
                <option key={s.valor} value={s.valor}>{s.rotulo}</option>
              ))}
            </select>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <input className="field-input" type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
              <input className="field-input" type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
          )}
        </div>
        <div>
          <label className="field-label">Categoria</label>
          <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Todas</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        {mostrarUnidade && (
          <div className="col-span-2">
            <label className="field-label">Unidade</label>
            <select className="field-input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              <option value="">Todas as unidades</option>
              {unidadesVisiveis.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>
        )}
        <div className={`${mostrarUnidade ? "col-span-2" : "col-span-4"} flex justify-end gap-2`}>
          <button type="button" className="btn flex items-center gap-1.5" onClick={limpar}>
            <X size={14} /> Limpar pesquisa
          </button>
          <button type="submit" className="btn-primary flex items-center gap-1.5" disabled={buscando}>
            <Search size={14} /> {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </form>

      {resultados && (
        <>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted">{resultados.length} resultado(s)</p>
            {resultados.length > 0 && (
              <button className="btn flex items-center gap-1.5" onClick={exportar}>
                <FileDown size={14} /> Exportar para Excel
              </button>
            )}
          </div>

          {resultados.length === 0 ? (
            <div className="card p-10 flex flex-col items-center text-center text-muted">
              <SearchX size={28} className="mb-2 opacity-60" />
              <p>Nenhum resultado encontrado.</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                    <td className="p-3">Data</td>
                    {mostrarUnidade && <td className="p-3">Unidade</td>}
                    <td className="p-3">Nº OS</td>
                    <td className="p-3">Categoria</td>
                    <td className="p-3">Tipo de serviço</td>
                    <td className="p-3 text-right">Orçamento</td>
                    <td className="p-3 text-right">Pago</td>
                    <td className="p-3">Forma de pagamento</td>
                    <td className="p-3 w-10"></td>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r) => {
                    const Icone = iconeCategoria(r.categorias?.nome);
                    return (
                      <tr key={r.id} className="border-t border-line hover:bg-canvas/60 cursor-pointer" onClick={() => abrirDetalhe(r)}>
                        <td className="p-3">{formatarDataBR(r.data)}</td>
                        {mostrarUnidade && <td className="p-3">{r.unidades?.nome}</td>}
                        <td className="p-3 font-mono-num">{r.numero_os}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1.5">
                            <Icone size={13} className="text-muted" />
                            {r.categorias?.nome || "—"}
                          </span>
                        </td>
                        <td className="p-3">
                          {r.tipos_servico?.nome}{" "}
                          {r.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                        </td>
                        <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(r.orcamento_aprovado)}</td>
                        <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(r.valor_pago)}</td>
                        <td className="p-3">
                          {r.forma_pagamento === "MÚLTIPLAS" ? (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded bg-gold-soft/50 text-gold-strong font-medium cursor-help"
                              title={(r.formas_pagamento || []).map((f) => `${f.forma_pagamento}: R$ ${formatarMoedaSemSimbolo(f.valor)}`).join(" · ")}
                            >
                              Múltiplas
                            </span>
                          ) : (
                            <span className="text-xs text-muted">{r.forma_pagamento || "—"}</span>
                          )}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {podeEditar && (
                              <button
                                className="text-muted hover:text-gold transition"
                                title="Alterar"
                                onClick={(e) => { e.stopPropagation(); abrirDetalhe(r); setEditando(true); }}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {podeExcluir && (
                              <button
                                className="text-muted hover:text-danger transition"
                                title="Excluir"
                                onClick={(e) => { e.stopPropagation(); abrirDetalhe(r); setExcluindo(true); }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {selecionado && (
        <>
          <Modal
            titulo={`OS ${selecionado.numero_os}`}
            subtitulo={mostrarUnidade ? selecionado.unidades?.nome : undefined}
            onFechar={() => setSelecionado(null)}
          >
          {excluindo ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <p>
                  Você está prestes a excluir permanentemente o lançamento de{" "}
                  <span className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionado.valor_pago)}</span> da OS{" "}
                  <span className="font-mono-num font-medium">{selecionado.numero_os}</span>. Essa ação não pode ser desfeita.
                </p>
              </div>
              <div>
                <label className="field-label">Motivo da exclusão (obrigatório)</label>
                <textarea
                  className="field-input"
                  rows={3}
                  value={motivoExclusao}
                  onChange={(e) => setMotivoExclusao(e.target.value)}
                  placeholder="Ex: lançamento de teste, duplicado por engano, etc."
                />
                <p className="text-xs text-muted mt-1">O motivo fica registrado no log do sistema, junto com os dados do lançamento excluído.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setExcluindo(false)}>Cancelar</button>
                <button
                  className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
                  disabled={!motivoExclusao.trim() || processandoExclusao}
                  onClick={confirmarExclusao}
                >
                  <Trash2 size={14} /> {processandoExclusao ? "Excluindo…" : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          ) : !editando ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted">Data</p><p className="font-medium">{formatarDataBR(selecionado.data)}</p></div>
                <div><p className="text-xs text-muted">Categoria</p><p className="font-medium">{selecionado.categorias?.nome || "—"}</p></div>
                <div><p className="text-xs text-muted">Tipo de serviço</p><p className="font-medium">{selecionado.tipos_servico?.nome}</p></div>
                <div><p className="text-xs text-muted">Atendente</p><p className="font-medium">{selecionado.usuarios?.nome_completo}</p></div>
                <div><p className="text-xs text-muted">Orçamento aprovado</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionado.orcamento_aprovado)}</p></div>
                <div><p className="text-xs text-muted">Valor pago</p><p className="font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(selecionado.valor_pago)}</p></div>
                {selecionado.forma_pagamento === "MÚLTIPLAS" ? (
                  <div className="col-span-2">
                    <p className="text-xs text-muted mb-1">Formas de pagamento</p>
                    <div className="space-y-1">
                      {(selecionado.formas_pagamento || []).map((f, i) => (
                        <p key={i} className="font-medium text-sm">
                          R$ {formatarMoedaSemSimbolo(f.valor)} — {f.forma_pagamento}
                          {f.parcelas ? ` · ${f.parcelas}x` : ""}{f.bandeira ? ` · ${f.bandeira}` : ""}
                        </p>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div><p className="text-xs text-muted">Forma de pagamento</p><p className="font-medium">{selecionado.forma_pagamento || "Nenhuma"}</p></div>
                    <div><p className="text-xs text-muted">Bandeira / Parcelas</p><p className="font-medium">{selecionado.bandeira || "—"} {selecionado.parcelas ? `· ${selecionado.parcelas}x` : ""}</p></div>
                  </>
                )}
                {selecionado.observacoes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted">Observações</p>
                    <p className="font-medium whitespace-pre-wrap">{selecionado.observacoes}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2">
                {podeExcluir && (
                  <button className="btn flex items-center gap-1.5 text-danger border-danger/30 hover:bg-danger-soft" onClick={() => setExcluindo(true)}>
                    <Trash2 size={14} /> Excluir
                  </button>
                )}
                {podeEditar && (
                  <button className="btn flex items-center gap-1.5" onClick={() => setEditando(true)}>
                    <Pencil size={14} /> Alterar
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {podeEditarData && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="field-label">Data do lançamento</label>
                    <input
                      type="date"
                      className="field-input"
                      value={edicao.data || ""}
                      onChange={(e) => setEdicao({ ...edicao, data: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="field-label">Nº da OS</label>
                    <input
                      className="field-input font-mono-num"
                      maxLength={10}
                      value={edicao.numero_os || ""}
                      onChange={(e) => {
                        setEdicao({ ...edicao, numero_os: e.target.value.toUpperCase() });
                        setErroNumeroOs(null);
                      }}
                    />
                    {erroNumeroOs && <p className="text-xs text-danger mt-1">{erroNumeroOs}</p>}
                  </div>
                </div>
              )}
              <div>
                <label className="field-label">Categoria</label>
                <select
                  className="field-input"
                  value={edicao.categoria_id || ""}
                  onChange={(e) => setEdicao({ ...edicao, categoria_id: e.target.value, tipo_servico_id: "" })}
                >
                  <option value="">Selecione</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Tipo de serviço</label>
                <select
                  className="field-input"
                  value={edicao.tipo_servico_id || ""}
                  onChange={(e) => setEdicao({ ...edicao, tipo_servico_id: e.target.value })}
                >
                  <option value="">{edicao.categoria_id ? "Selecione" : "Escolha a categoria primeiro"}</option>
                  {tiposServicoEdicao.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Orçamento aprovado <span className="normal-case text-muted">(opcional)</span></label>
                  <CurrencyInput valor={edicao.orcamento_aprovado} onChange={(v) => setEdicao({ ...edicao, orcamento_aprovado: v })} />
                </div>
                <div>
                  <label className="field-label">Valor pago</label>
                  {formasPagamentoEdicao.length > 0 ? (
                    <CurrencyInput valor={formasPagamentoEdicao.reduce((s, f) => s + (Number(f.valor) || 0), 0)} disabled />
                  ) : (
                    <CurrencyInput valor={edicao.valor_pago} onChange={(v) => setEdicao({ ...edicao, valor_pago: v })} />
                  )}
                </div>

                <div className="col-span-2">
                  <label className="field-label">Forma de pagamento</label>
                  {formasPagamentoEdicao.length > 0 ? (
                    <div className="field-input flex items-center justify-between bg-canvas">
                      <span className="text-sm text-ink">Múltiplas formas</span>
                      <button type="button" onClick={usarFormaUnicaEdicao} className="text-xs text-muted hover:text-danger transition flex items-center gap-1">
                        <X size={12} /> usar 1 forma
                      </button>
                    </div>
                  ) : (
                    <div>
                      <select
                        className="field-input"
                        value={edicao.forma_pagamento}
                        onChange={(e) => setEdicao({ ...edicao, forma_pagamento: e.target.value })}
                        disabled={!(Number(edicao.valor_pago) > 0)}
                      >
                        <option value="">{Number(edicao.valor_pago) > 0 ? "Selecione" : "Nenhuma"}</option>
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setMostrarModalFormasEdicao(true)}
                        className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white
                          bg-gradient-to-b from-gold to-gold-strong shadow-sm hover:brightness-105 hover:-translate-y-px active:translate-y-0 transition-all"
                      >
                        <Ticket size={13} /> Dividir em mais de uma forma
                      </button>
                    </div>
                  )}
                </div>

                {formasPagamentoEdicao.length === 0 && (precisaParcelasFn(edicao.forma_pagamento) || precisaBandeiraFn(edicao.forma_pagamento)) && (
                  <>
                    {precisaParcelasFn(edicao.forma_pagamento) && (
                      <div>
                        <label className="field-label">Parcelas</label>
                        <select className="field-input" value={edicao.parcelas} onChange={(e) => setEdicao({ ...edicao, parcelas: e.target.value })}>
                          <option value="">1x</option>
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <option key={n} value={n}>{n}x</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {precisaBandeiraFn(edicao.forma_pagamento) && (
                      <div className={precisaParcelasFn(edicao.forma_pagamento) ? "" : "col-span-2"}>
                        <label className="field-label">Bandeira</label>
                        <div className="flex gap-1.5 flex-wrap">
                          {BANDEIRAS.map((b) => (
                            <button
                              type="button"
                              key={b}
                              onClick={() => setEdicao({ ...edicao, bandeira: b })}
                              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                                edicao.bandeira === b ? "border-gold bg-gold-soft/60 text-gold-strong font-medium" : "border-line bg-white text-muted hover:border-gold/50"
                              }`}
                            >
                              {b}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {formasPagamentoEdicao.length > 0 && (
                  <div className="col-span-2">
                    <div className="card divide-y divide-line">
                      {formasPagamentoEdicao.map((f) =>
                        linhaEditandoEdicao === f.id ? (
                          <div key={f.id} className="p-3">
                            <div className="flex items-start gap-2">
                              <div className="w-28 shrink-0">
                                <label className="field-label">Valor</label>
                                <CurrencyInput valor={f.valor} onChange={(v) => atualizarCampoLinhaEdicao(f.id, "valor", v)} />
                              </div>
                              <div className="flex-1">
                                <label className="field-label">Forma</label>
                                <select className="field-input" value={f.forma_pagamento} onChange={(e) => atualizarCampoLinhaEdicao(f.id, "forma_pagamento", e.target.value)}>
                                  <option value="">Selecione</option>
                                  {FORMAS_PAGAMENTO.map((fp) => (
                                    <option key={fp} value={fp}>{fp}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-2">
                              <button type="button" className="btn text-xs" onClick={cancelarEdicaoLinhaEdicao}>Cancelar</button>
                              <button type="button" className="btn-primary text-xs" onClick={() => salvarEdicaoLinhaEdicao(f)}>Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <div key={f.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-medium">R$ {Number(f.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                              <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{f.forma_pagamento}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button type="button" title="Alterar" onClick={() => iniciarEdicaoLinhaEdicao(f)} className="text-muted hover:text-gold transition p-1">
                                <Pencil size={14} />
                              </button>
                              <button type="button" title="Excluir" onClick={() => excluirLinhaEdicao(f.id)} className="text-muted hover:text-danger transition p-1">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                    <button type="button" onClick={adicionarLinhaInlineEdicao} className="btn text-xs flex items-center gap-1.5 mt-2">
                      <Plus size={13} /> Adicionar outra forma de pagamento
                    </button>
                  </div>
                )}

                <div className="col-span-2">
                  <label className="field-label flex items-center gap-1.5"><StickyNote size={12} className="text-muted" /> Observações <span className="normal-case text-muted">(opcional)</span></label>
                  <textarea
                    className="field-input min-h-[60px] resize-y"
                    value={edicao.observacoes || ""}
                    onChange={(e) => setEdicao({ ...edicao, observacoes: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-xs text-muted">Toda alteração fica registrada no log do sistema para auditoria.</p>
              <div className="flex justify-end gap-2">
                <button className="btn" onClick={() => setEditando(false)}>Cancelar</button>
                <button className="btn-primary" onClick={salvarEdicao} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar alteração"}
                </button>
              </div>
            </div>
          )}
        </Modal>

          <FormasPagamentoModal
            aberto={mostrarModalFormasEdicao}
            formasIniciais={[]}
            onFechar={() => setMostrarModalFormasEdicao(false)}
            onSalvar={aoSalvarModalFormasEdicao}
          />
        </>
      )}
    </div>
  );
}

export default function ConsultaPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
