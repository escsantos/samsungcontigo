"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, Pencil, Save, Trash2, Plus, Search, CheckCircle2, Receipt, Paperclip, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { CORES_STATUS, ICONES_STATUS, FORMAS_PAGAMENTO } from "../../../lib/estoque";
import { calcularPreco } from "../../../lib/precos";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

const CORES_STATUS_FALLBACK = { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
export default function DetalheOrcamentoPage() {
  const { id } = useParams();
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [orcamento, setOrcamento] = useState(undefined);
  const [itens, setItens] = useState([]);
  const [ajustando, setAjustando] = useState(false);
  const [confirmarRejeitar, setConfirmarRejeitar] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [qtdsBusca, setQtdsBusca] = useState({});
  const [pecasAdicionadasAgora, setPecasAdicionadasAgora] = useState([]);
  const [desconto, setDesconto] = useState("0");

  // pagamento na revisão
  const [pagamentos, setPagamentos] = useState([]);
  const [seguirSemPagamento, setSeguirSemPagamento] = useState(false);
  const [pagamentoModalAberto, setPagamentoModalAberto] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[0]);
  const [valorPagamento, setValorPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [arquivoAnexo, setArquivoAnexo] = useState(null);
  const [processandoPagamento, setProcessandoPagamento] = useState(false);

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    setPerfil(await getPerfilAtual());
    const { data: orc } = await supabase.from("orcamentos").select("*, clientes(nome, celular, email)").eq("id", id).single();
    setOrcamento(orc);
    setDesconto(String(orc?.desconto || 0));
    const { data: its } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", id).order("id");
    setItens(its || []);
    const { data: pags } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", id).order("registrado_em");
    setPagamentos(pags || []);
    if (orc) {
      const totalPago = (pags || []).reduce((s, p) => s + Number(p.valor), 0);
      const faltando = Number(orc.valor_total || 0) - totalPago;
      setValorPagamento(faltando > 0 ? faltando.toFixed(2) : "");
    }
  }

  const subtotalItens = itens.reduce((s, i) => s + Number(i.venda_total || 0), 0);
  const descontoNum = Math.min(Math.max(parseFloat(desconto) || 0, 0), subtotalItens);
  const totalComDesconto = subtotalItens - descontoNum;
  const custoTotalGeral = itens.reduce((s, i) => s + Number(i.custo_unitario || 0) * i.qtd, 0);
  const impostoPct = Number(orcamento?.imposto_total || 0);
  const impostoTotalGeral = totalComDesconto * (impostoPct / 100);
  const lucroFinal = totalComDesconto - custoTotalGeral - impostoTotalGeral;
  const margemFinal = totalComDesconto > 0 ? (lucroFinal / totalComDesconto) * 100 : 0;

  const totalAtual = totalComDesconto;

  function mudarQtdItem(itemId, valor) {
    const n = Math.max(1, parseInt(valor, 10) || 1);
    setItens((atual) =>
      atual.map((i) => (i.id === itemId ? { ...i, qtd: n, venda_total: Number(i.venda_unitario) * n } : i))
    );
  }

  function mudarCustoItem(itemId, valor) {
    const novoCusto = parseFloat(valor);
    setItens((atual) =>
      atual.map((i) => {
        if (i.id !== itemId) return i;
        const custo = isNaN(novoCusto) ? 0 : novoCusto;
        const { venda } = calcularPreco(custo, Number(orcamento.margem), Number(orcamento.imposto_total));
        return { ...i, custo_unitario: custo, venda_unitario: venda, venda_total: venda !== null ? venda * i.qtd : i.venda_total };
      })
    );
  }

  function removerItem(itemId) {
    setItens((atual) => atual.filter((i) => i.id !== itemId));
  }

  useEffect(() => {
    if (!buscaAberta) return;
    const termo = termoBusca.trim();
    if (!termo) {
      setResultadosBusca([]);
      return;
    }
    setBuscando(true);
    const t = setTimeout(async () => {
      const like = `%${termo}%`;
      const { data } = await supabase
        .from("pecas")
        .select("*")
        .or(`modelo.ilike.${like},codigo.ilike.${like},descricao_resumida.ilike.${like},descricao_peca.ilike.${like}`)
        .limit(30);
      setResultadosBusca(data || []);
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [termoBusca, buscaAberta]);

  function fecharBusca() {
    setBuscaAberta(false);
    setTermoBusca("");
    setResultadosBusca([]);
    setQtdsBusca({});
    setPecasAdicionadasAgora([]);
  }

  function adicionarPeca(peca) {
    const qtdEscolhida = Math.max(1, parseInt(qtdsBusca[peca.id], 10) || 1);

    if (itens.some((i) => i.codigo === peca.codigo)) {
      setItens((atual) =>
        atual.map((i) =>
          i.codigo === peca.codigo
            ? { ...i, qtd: i.qtd + qtdEscolhida, venda_total: Number(i.venda_unitario) * (i.qtd + qtdEscolhida) }
            : i
        )
      );
      setPecasAdicionadasAgora((atual) => [...atual, peca.id]);
      return;
    }
    const { venda } = calcularPreco(peca.valor_unitario, Number(orcamento.margem), Number(orcamento.imposto_total));
    const novoItem = {
      id: `novo-${peca.id}-${Date.now()}`,
      _novo: true,
      peca_id: peca.id,
      modelo: peca.modelo,
      categoria: peca.categoria,
      codigo: peca.codigo,
      descricao_resumida: peca.descricao_resumida,
      descricao_peca: peca.descricao_peca,
      qtd: qtdEscolhida,
      custo_unitario: peca.valor_unitario,
      venda_unitario: venda,
      venda_total: venda * qtdEscolhida
    };
    setItens((atual) => [...atual, novoItem]);
    setPecasAdicionadasAgora((atual) => [...atual, peca.id]);
  }

  async function salvarAjustes() {
    setProcessando(true);
    setErro("");

    // 1º: descobre quais itens já existiam no banco ANTES de qualquer alteração
    const { data: itensNoBancoAntes } = await supabase.from("orcamento_itens").select("id").eq("orcamento_id", id);
    const idsExistentesAntes = (itensNoBancoAntes || []).map((i) => i.id);

    // 2º: dos que já existiam, quais continuam na lista local (não foram removidos com a lixeira)
    const idsParaManter = itens.filter((i) => !i._novo).map((i) => i.id);
    const idsParaExcluir = idsExistentesAntes.filter((oid) => !idsParaManter.includes(oid));
    if (idsParaExcluir.length > 0) {
      await supabase.from("orcamento_itens").delete().in("id", idsParaExcluir);
    }

    // 3º: atualiza qtd/custo/venda dos itens que já existiam e continuam
    for (const i of itens.filter((i) => !i._novo)) {
      await supabase
        .from("orcamento_itens")
        .update({ qtd: i.qtd, custo_unitario: i.custo_unitario, venda_unitario: i.venda_unitario, venda_total: i.venda_total })
        .eq("id", i.id);
    }

    // 4º: só agora insere os itens novos (depois de já ter decidido o que excluir)
    for (const i of itens.filter((i) => i._novo)) {
      const { error } = await supabase.from("orcamento_itens").insert({
        orcamento_id: id,
        peca_id: i.peca_id,
        modelo: i.modelo,
        categoria: i.categoria,
        codigo: i.codigo,
        descricao_resumida: i.descricao_resumida,
        descricao_peca: i.descricao_peca,
        qtd: i.qtd,
        custo_unitario: i.custo_unitario,
        venda_unitario: i.venda_unitario,
        venda_total: i.venda_total
      });
      if (error) {
        setProcessando(false);
        setErro("Falha ao adicionar peça " + i.codigo + ": " + error.message);
        return;
      }
    }

    const novoTotal = itens.reduce((s, i) => s + Number(i.venda_total || 0), 0);
    const novoDesconto = Math.min(Math.max(parseFloat(desconto) || 0, 0), novoTotal);
    const { error } = await supabase
      .from("orcamentos")
      .update({ valor_total: novoTotal - novoDesconto, desconto: novoDesconto })
      .eq("id", id);
    setProcessando(false);
    if (error) {
      setErro("Falha ao salvar ajustes: " + error.message);
      return;
    }
    setAjustando(false);
    carregar();
  }

  const totalPagoAgora = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const faltandoAgora = Number(orcamento?.valor_total || 0) - totalPagoAgora;
  const pagamentoCompleto = faltandoAgora <= 0.004;
  const percentualPagoAgora = Number(orcamento?.valor_total || 0) > 0 ? (totalPagoAgora / Number(orcamento.valor_total)) * 100 : 0;
  const atingiu30Porcento = percentualPagoAgora >= 30;
  const podeAprovar = atingiu30Porcento || seguirSemPagamento;

  async function adicionarPagamentoRevisao() {
    const valor = parseFloat(valorPagamento);
    if (!valor || valor <= 0 || !dataPagamento) return;
    setProcessandoPagamento(true);
    setErro("");

    let anexoPath = null;
    if (arquivoAnexo) {
      const nomeArquivo = `${id}/${Date.now()}-${arquivoAnexo.name}`;
      const { error: errUpload } = await supabase.storage.from("comprovantes").upload(nomeArquivo, arquivoAnexo);
      if (errUpload) {
        setProcessandoPagamento(false);
        setErro("Falha ao subir o anexo: " + errUpload.message);
        return;
      }
      anexoPath = nomeArquivo;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("pagamentos_orcamento").insert({
      orcamento_id: id,
      forma_pagamento: formaPagamento,
      valor,
      data_pagamento: dataPagamento,
      anexo_url: anexoPath,
      registrado_por: user.id
    });

    if (error) {
      setProcessandoPagamento(false);
      setErro("Falha ao registrar pagamento: " + error.message);
      return;
    }

    const { data: pagsAtuais } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", id);
    const totalPago = (pagsAtuais || []).reduce((s, p) => s + Number(p.valor), 0);
    if (totalPago >= Number(orcamento.valor_total) - 0.01 && orcamento.sem_pagamento) {
      await supabase.from("orcamentos").update({ sem_pagamento: false }).eq("id", id);
    }

    setArquivoAnexo(null);
    setProcessandoPagamento(false);
    setPagamentoModalAberto(false);
    carregar();
  }

  async function excluirPagamentoRevisao(pagamentoId) {
    setProcessando(true);
    await supabase.from("pagamentos_orcamento").delete().eq("id", pagamentoId);
    setProcessando(false);
    carregar();
  }

  const [editandoPagamento, setEditandoPagamento] = useState(null);
  const [edicaoPagamento, setEdicaoPagamento] = useState({});

  function iniciarEdicaoPagamento(p) {
    setEditandoPagamento(p.id);
    setEdicaoPagamento({ forma_pagamento: p.forma_pagamento, valor: String(p.valor), data_pagamento: p.data_pagamento });
  }

  async function salvarEdicaoPagamento(pagamentoId) {
    const valor = parseFloat(edicaoPagamento.valor);
    if (!valor || valor <= 0 || !edicaoPagamento.data_pagamento) return;
    setProcessando(true);
    await supabase
      .from("pagamentos_orcamento")
      .update({ forma_pagamento: edicaoPagamento.forma_pagamento, valor, data_pagamento: edicaoPagamento.data_pagamento })
      .eq("id", pagamentoId);
    setProcessando(false);
    setEditandoPagamento(null);
    carregar();
  }

  async function verComprovanteRevisao(anexoUrl) {
    if (!anexoUrl) return;
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(anexoUrl, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  async function aprovar() {
    if (!podeAprovar) {
      setErro("Receba pelo menos 30% do valor ou marque \"Concordo em seguir com pagamento inferior a 30%\" antes de aprovar.");
      return;
    }
    setProcessando(true);
    setErro("");
    const { data: { user } } = await supabase.auth.getUser();

    if (!atingiu30Porcento && seguirSemPagamento) {
      await supabase.from("notificacoes").insert({
        tipo: "pedido_sem_pagamento",
        mensagem: `Pedido #${id} (${orcamento.clientes?.nome || ""}) foi aprovado com pagamento abaixo de 30% (recebido ${fmtBRL(totalPagoAgora)} de ${fmtBRL(orcamento.valor_total)}).`
      });
    }

    const { error } = await supabase
      .from("orcamentos")
      .update({
        status: "Aguardando Separação/Compra",
        revisado_por: user.id,
        revisado_em: new Date().toISOString(),
        sem_pagamento: !pagamentoCompleto
      })
      .eq("id", id);
    setProcessando(false);
    if (error) {
      setErro("Falha ao aprovar: " + error.message);
      return;
    }
    carregar();
  }

  async function rejeitar() {
    setProcessando(true);
    setErro("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        status: "Rejeitado",
        motivo_rejeicao: motivoRejeicao.trim() || null,
        revisado_por: user.id,
        revisado_em: new Date().toISOString()
      })
      .eq("id", id);
    setProcessando(false);
    setConfirmarRejeitar(false);
    if (error) {
      setErro("Falha ao rejeitar: " + error.message);
      return;
    }
    carregar();
  }

  if (perfil === undefined || orcamento === undefined) {
    return <AppShell titulo="Orçamento"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (!orcamento) {
    return <AppShell titulo="Orçamento"><p className="text-sm text-muted">Orçamento não encontrado.</p></AppShell>;
  }

  const podeRevisar = orcamento.status === "Pendente de Análise" && ["Administrador", "Diretor", "Gerente", "Vendedor"].includes(perfil?.cargo);
  const cor = CORES_STATUS[orcamento.status] || CORES_STATUS_FALLBACK;
  const IconeStatusAtual = ICONES_STATUS[orcamento.status];
  const mostraCusto = perfil?.cargo !== "Cliente";

  return (
    <AppShell titulo={`Orçamento #${orcamento.id}`}>
      <button onClick={() => router.push("/orcamentos")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para Orçamentos
      </button>

      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-display font-semibold text-lg">{orcamento.clientes?.nome}</p>
            <p className="text-sm text-muted">{orcamento.clientes?.celular || orcamento.clientes?.email || ""}</p>
          </div>
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
            {IconeStatusAtual && <IconeStatusAtual size={13} />}
            {orcamento.status}
          </span>
        </div>
        {orcamento.sem_pagamento && (
          <div
            className="mt-4 rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2"
            style={{ background: "rgba(214,51,108,0.12)", color: "#D6336C" }}
          >
            <AlertTriangle size={14} />
            SEM PAGAMENTO — este pedido segue o fluxo antes do pagamento estar completo
          </div>
        )}
        {orcamento.status === "Rejeitado" && orcamento.motivo_rejeicao && (
          <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">
            Motivo: {orcamento.motivo_rejeicao}
          </div>
        )}
        {orcamento.status !== "Pendente de Análise" && orcamento.status !== "Rejeitado" && ["Administrador", "Diretor", "Gerente", "Estoque"].includes(perfil?.cargo) && (
          <button
            onClick={() => router.push(`/estoque/${orcamento.id}`)}
            className="text-sm mt-4 hover:underline"
            style={{ color: "var(--accent)" }}
          >
            Ver acompanhamento no Estoque →
          </button>
        )}
      </div>

      {ajustando && (
        <div className="mb-4">
          <button className="btn-secondary text-sm" onClick={() => setBuscaAberta(true)}>
            <Plus size={15} />
            Adicionar peça
          </button>
        </div>
      )}

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
              <th className="text-left px-4 py-2.5">Modelo</th>
              <th className="text-left px-4 py-2.5">Categoria</th>
              <th className="text-left px-4 py-2.5">Código</th>
              <th className="text-left px-4 py-2.5">Descrição</th>
              <th className="text-center px-4 py-2.5">Qtd</th>
              {mostraCusto && (
                <>
                  <th className="text-right px-4 py-2.5">Custo</th>
                  <th className="text-right px-4 py-2.5">Imposto</th>
                  <th className="text-right px-4 py-2.5">Lucro Líquido</th>
                  <th className="text-right px-4 py-2.5">Margem</th>
                </>
              )}
              <th className="text-right px-4 py-2.5">{mostraCusto ? "Venda" : "Valor"}</th>
              {ajustando && <th></th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const corCat = corCategoria(i.categoria);
              const Icone = iconeCategoria(i.categoria);
              const custoTotal = Number(i.custo_unitario || 0) * i.qtd;
              const impostoPct = Number(orcamento.imposto_total || 0);
              const impostoValor = Number(i.venda_total || 0) * (impostoPct / 100);
              const lucroLiquido = Number(i.venda_total || 0) - custoTotal - impostoValor;
              const margemItem = Number(i.venda_total || 0) > 0 ? (lucroLiquido / Number(i.venda_total)) * 100 : 0;
              return (
                <tr key={i.id} className="border-b border-line last:border-0" style={{ background: i._novo ? "var(--accent-soft)" : "transparent" }}>
                  <td className="px-4 py-2.5 font-mono font-medium">{i.modelo}</td>
                  <td className="px-4 py-2.5">
                    <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: corCat.bg, color: corCat.fg }}>
                      <Icone size={11} />
                      {i.categoria}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: "var(--accent)" }}>{i.codigo}</td>
                  <td className="px-4 py-2.5">{i.descricao_resumida}</td>
                  <td className="px-4 py-2.5 text-center">
                    {ajustando ? (
                      <input
                        type="number"
                        min={1}
                        className="field-input py-1 px-1.5 text-center font-mono w-14 mx-auto"
                        value={i.qtd}
                        onChange={(e) => mudarQtdItem(i.id, e.target.value)}
                      />
                    ) : (
                      i.qtd
                    )}
                  </td>
                  {mostraCusto && (
                    <>
                      <td className="px-4 py-2.5 text-right">
                        {ajustando ? (
                          <input
                            type="number"
                            step="0.01"
                            className="field-input py-1 px-1.5 text-right font-mono w-24 ml-auto"
                            value={i.custo_unitario ?? ""}
                            onChange={(e) => mudarCustoItem(i.id, e.target.value)}
                            title="Custo editável só pra este pedido — não altera a base de peças"
                          />
                        ) : (
                          <span className="font-mono">{fmtBRL(custoTotal)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(impostoValor)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(lucroLiquido)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{margemItem.toFixed(1)}%</td>
                    </>
                  )}
                  <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: mostraCusto ? "#2C7C6E" : undefined }}>{fmtBRL(i.venda_total)}</td>
                  {ajustando && (
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => removerItem(i.id)} className="text-muted hover:text-danger">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {ajustando && mostraCusto && (
        <div className="card p-5 mb-4">
          <p className="font-display font-semibold text-sm mb-3">Desconto no valor final</p>
          <div className="flex items-center gap-2 max-w-xs mb-4">
            <span className="text-sm text-muted">R$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              className="field-input"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
            />
          </div>

          <p className="text-xs font-semibold text-muted mb-2">Resumo da negociação</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-[11px] text-muted">Subtotal</p>
              <p className="font-mono font-semibold">{fmtBRL(subtotalItens)}</p>
            </div>
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-[11px] text-muted">Desconto</p>
              <p className="font-mono font-semibold text-danger">- {fmtBRL(descontoNum)}</p>
            </div>
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-[11px] text-muted">Total com desconto</p>
              <p className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{fmtBRL(totalComDesconto)}</p>
            </div>
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-[11px] text-muted">Lucro líquido final</p>
              <p className="font-mono font-semibold" style={{ color: lucroFinal >= 0 ? "#2C7C6E" : "var(--danger)" }}>{fmtBRL(lucroFinal)}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted">Margem final:</span>
            <span
              className="text-xs font-mono font-bold px-2 py-0.5 rounded"
              style={{
                background: margemFinal >= 30 ? "rgba(63,167,150,0.14)" : margemFinal >= 20 ? "rgba(232,163,61,0.14)" : "var(--danger-soft)",
                color: margemFinal >= 30 ? "#2C7C6E" : margemFinal >= 20 ? "#C2801F" : "var(--danger)"
              }}
            >
              {margemFinal.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {podeRevisar && !ajustando && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
                <Receipt size={16} style={{ color: "var(--accent)" }} />
                Pagamento
              </p>
              <p className="text-xs text-muted">
                Total pago: <b className="font-mono text-ink">{fmtBRL(totalPagoAgora)}</b>
                {" ("}{percentualPagoAgora.toFixed(0)}%{") · "}
                {pagamentoCompleto ? (
                  <span className="font-semibold" style={{ color: "#2C7C6E" }}>Completo ✓</span>
                ) : atingiu30Porcento ? (
                  <span className="font-semibold" style={{ color: "#2C7C6E" }}>≥ 30% recebido — pode aprovar ✓</span>
                ) : (
                  <span className="font-semibold text-danger">Faltam {fmtBRL(faltandoAgora)} pra completar (mín. 30%: {fmtBRL(Number(orcamento.valor_total) * 0.3)})</span>
                )}
              </p>
            </div>
            <button className="btn-secondary" onClick={() => setPagamentoModalAberto(true)}>
              <Plus size={15} />
              Registrar pagamento
            </button>
          </div>

          {!atingiu30Porcento && (
            <label className="flex items-start gap-2.5 mt-4 p-3 rounded-lg border border-line cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={seguirSemPagamento}
                onChange={(e) => setSeguirSemPagamento(e.target.checked)}
              />
              <span className="text-xs">
                <span className="font-medium">Concordo em seguir com pagamento inferior a 30%</span>
                <span className="block text-muted mt-0.5">
                  O pedido segue o fluxo mesmo abaixo dos 30%. O gerente é avisado, e o pedido fica marcado até o pagamento ser concluído.
                </span>
              </span>
            </label>
          )}
        </div>
      )}

      <div className="card p-5 flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted">Total do orçamento</p>
          <p className="font-display font-bold text-2xl" style={{ color: "var(--accent)" }}>{fmtBRL(totalAtual)}</p>
          {descontoNum > 0 && !ajustando && (
            <p className="text-xs text-muted mt-0.5">Desconto aplicado: {fmtBRL(descontoNum)}</p>
          )}
        </div>

        {podeRevisar && (
          <div className="flex gap-2">
            {ajustando ? (
              <>
                <button className="btn-secondary" onClick={() => { setAjustando(false); carregar(); }}>Cancelar</button>
                <button className="btn-primary" disabled={processando} onClick={salvarAjustes}>
                  <Save size={15} />
                  Salvar ajustes
                </button>
              </>
            ) : (
              <>
                <button className="btn-secondary" onClick={() => setAjustando(true)}>
                  <Pencil size={15} />
                  Ajustar
                </button>
                <button className="btn-secondary text-danger" onClick={() => setConfirmarRejeitar(true)}>
                  <X size={15} />
                  Rejeitar
                </button>
                <button
                  className="btn-primary"
                  disabled={processando || !podeAprovar}
                  onClick={aprovar}
                  title={!podeAprovar ? "Receba pelo menos 30% ou marque a caixa de concordância" : ""}
                >
                  <Check size={15} />
                  Aprovar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <Modal
        open={pagamentoModalAberto}
        onClose={() => setPagamentoModalAberto(false)}
        title="Registrar pagamento"
        tamanho="lg"
      >
        <p className="text-xs text-muted mb-4">
          Valor do pedido: <b className="text-ink">{fmtBRL(orcamento.valor_total)}</b>. Pode registrar quantas formas de pagamento precisar.
        </p>

        {pagamentos.length > 0 && (
          <div className="mb-4 border border-line rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-3 py-2">Forma</th>
                  <th className="text-left px-3 py-2">Data</th>
                  <th className="text-right px-3 py-2">Valor</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {pagamentos.map((p) => {
                  const emEdicao = editandoPagamento === p.id;
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2">
                        {emEdicao ? (
                          <select className="field-input py-1 text-xs" value={edicaoPagamento.forma_pagamento} onChange={(e) => setEdicaoPagamento((a) => ({ ...a, forma_pagamento: e.target.value }))}>
                            {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        ) : (
                          p.forma_pagamento
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted">
                        {emEdicao ? (
                          <input type="date" className="field-input py-1 text-xs" value={edicaoPagamento.data_pagamento} onChange={(e) => setEdicaoPagamento((a) => ({ ...a, data_pagamento: e.target.value }))} />
                        ) : (
                          new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {emEdicao ? (
                          <input type="number" step="0.01" className="field-input py-1 text-xs text-right w-24 ml-auto" value={edicaoPagamento.valor} onChange={(e) => setEdicaoPagamento((a) => ({ ...a, valor: e.target.value }))} />
                        ) : (
                          fmtBRL(p.valor)
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {emEdicao ? (
                            <button onClick={() => salvarEdicaoPagamento(p.id)} className="text-muted hover:text-ink" title="Salvar">
                              <Save size={13} />
                            </button>
                          ) : (
                            <button onClick={() => iniciarEdicaoPagamento(p)} className="text-muted hover:text-ink" title="Editar">
                              <Pencil size={13} />
                            </button>
                          )}
                          {p.anexo_url && (
                            <button onClick={() => verComprovanteRevisao(p.anexo_url)} className="text-muted hover:text-ink" title="Ver comprovante">
                              <ExternalLink size={13} />
                            </button>
                          )}
                          <button onClick={() => excluirPagamentoRevisao(p.id)} className="text-muted hover:text-danger" title="Excluir">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mb-4 px-1">
          <span className="text-xs text-muted">Total pago: <b className="font-mono text-ink">{fmtBRL(totalPagoAgora)}</b></span>
          {pagamentoCompleto ? (
            <span className="text-xs font-semibold" style={{ color: "#2C7C6E" }}>Valor completo ✓</span>
          ) : (
            <span className="text-xs font-semibold text-danger">Faltam {fmtBRL(faltandoAgora)}</span>
          )}
        </div>

        {!pagamentoCompleto && (
          <>
            <p className="text-xs font-semibold mb-2">{pagamentos.length > 0 ? "Adicionar mais uma forma de pagamento" : "Registrar pagamento"}</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Forma de pagamento</label>
                <select className="field-input" value={formaPagamento} onChange={(e) => setFormaPagamento(e.target.value)}>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">Valor</label>
                <input type="number" step="0.01" className="field-input" value={valorPagamento} onChange={(e) => setValorPagamento(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Data do pagamento</label>
                <input type="date" className="field-input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Anexo (opcional)</label>
                <label className="flex items-center gap-2 border border-line rounded-[10px] px-3.5 py-2.5 cursor-pointer text-sm text-muted hover:border-brand-400 truncate">
                  <Paperclip size={14} className="shrink-0" />
                  <span className="truncate">{arquivoAnexo ? arquivoAnexo.name : "Escolher arquivo"}</span>
                  <input type="file" className="hidden" onChange={(e) => setArquivoAnexo(e.target.files[0] || null)} />
                </label>
              </div>
            </div>
            <button
              className="btn-primary mt-5"
              disabled={processandoPagamento || !valorPagamento || !dataPagamento}
              onClick={adicionarPagamentoRevisao}
            >
              <Plus size={15} />
              {processandoPagamento ? "Salvando..." : "Adicionar pagamento"}
            </button>
          </>
        )}
      </Modal>

      <Modal
        open={confirmarRejeitar}
        onClose={() => setConfirmarRejeitar(false)}
        title="Rejeitar orçamento?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarRejeitar(false)}>Cancelar</button>
            <button className="btn-primary" disabled={processando} onClick={rejeitar}>Confirmar rejeição</button>
          </>
        }
      >
        <label className="field-label">Motivo (opcional, o cliente vai ver)</label>
        <textarea className="field-input" rows={3} value={motivoRejeicao} onChange={(e) => setMotivoRejeicao(e.target.value)} />
      </Modal>

      <Modal
        open={buscaAberta}
        onClose={fecharBusca}
        title="Adicionar peça ao pedido"
        tamanho="xl"
        footer={<button className="btn-primary" onClick={fecharBusca}>Concluído</button>}
      >
        <div className="relative mb-3">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            className="field-input pl-9"
            placeholder="Buscar por código, modelo ou descrição..."
            value={termoBusca}
            onChange={(e) => setTermoBusca(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-96 overflow-auto -mx-6 border-t border-line">
          {buscando ? (
            <p className="text-sm text-muted px-6 py-3">Buscando...</p>
          ) : resultadosBusca.length === 0 ? (
            <p className="text-sm text-muted px-6 py-3">{termoBusca ? "Nenhuma peça encontrada." : "Digite para buscar."}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Descrição</th>
                  <th className="text-left px-3 py-2">Modelo</th>
                  <th className="text-right px-3 py-2">Custo</th>
                  <th className="text-right px-3 py-2">Imposto</th>
                  <th className="text-right px-3 py-2">Venda</th>
                  <th className="text-center px-3 py-2">Qtd</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {resultadosBusca.map((p) => {
                  const { venda, imposto } = calcularPreco(p.valor_unitario, Number(orcamento.margem), Number(orcamento.imposto_total));
                  const jaAdicionada = pecasAdicionadasAgora.includes(p.id);
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0 hover:bg-canvas">
                      <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--accent)" }}>{p.codigo}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{p.descricao_resumida}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">{p.modelo}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtBRL(p.valor_unitario)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtBRL(imposto)}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold">{fmtBRL(venda)}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={1}
                          className="field-input py-1 px-1 text-center font-mono w-12 mx-auto"
                          value={qtdsBusca[p.id] ?? 1}
                          onChange={(e) => setQtdsBusca((atual) => ({ ...atual, [p.id]: e.target.value }))}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {jaAdicionada ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: "#2C7C6E" }}>
                            <CheckCircle2 size={15} /> Adicionada
                          </span>
                        ) : (
                          <button onClick={() => adicionarPeca(p)} className="btn-secondary py-1.5 px-3 text-xs">
                            <Plus size={13} />
                            Adicionar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Modal>
    </AppShell>
  );
}
