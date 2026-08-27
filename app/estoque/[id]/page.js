"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ShieldAlert, Search, Check, AlertTriangle, Package,
  Receipt, Paperclip, PackageCheck, Send, ExternalLink, RefreshCw, Plus, Trash2, Copy, ArrowRight, Pencil, Save, XCircle,
  FileCheck2, Clock
} from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { getUnidadeAtiva } from "../../../lib/unidade";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import LinhaDoTempo from "../../../components/LinhaDoTempo";
import CancelarPedidoModal from "../../../components/CancelarPedidoModal";
import { registrarAuditoria } from "../../../lib/auditoria";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { CORES_STATUS, ICONES_STATUS, FORMAS_PAGAMENTO, rotuloPagamentoPendente } from "../../../lib/estoque";
import { STATUS_ELEGIVEIS_NF, statusNotaFiscal, RESUMO_STATUS_NF } from "../../../lib/fiscal";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function EstoquePedidoPage() {
  const { id } = useParams();
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [orcamento, setOrcamento] = useState(undefined);
  const [itens, setItens] = useState([]);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");
  const [foraDaUnidade, setForaDaUnidade] = useState(false);
  const [cancelandoPedido, setCancelandoPedido] = useState(false);

  // pedido de compra (único pro pedido inteiro)
  const [numeroPedidoCompra, setNumeroPedidoCompra] = useState("");
  const [codigoCopiado, setCodigoCopiado] = useState(null);
  const [confirmarAvanco, setConfirmarAvanco] = useState(null);

  // delivery por peça (cada linha tem a sua)
  const [deliveries, setDeliveries] = useState({});
  const [buscandoItem, setBuscandoItem] = useState({});
  const [erroItem, setErroItem] = useState({});

  // etapa "Em Estoque - Aguardando Faturamento"
  const [pagamentos, setPagamentos] = useState([]);
  const [formaPagamento, setFormaPagamento] = useState(FORMAS_PAGAMENTO[0]);
  const [valorPagamento, setValorPagamento] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [arquivoAnexo, setArquivoAnexo] = useState(null);
  const [processandoPagamento, setProcessandoPagamento] = useState(false);
  const [pagamentoModalAberto, setPagamentoModalAberto] = useState(false);

  // liberação parcial
  const [confirmarParcial, setConfirmarParcial] = useState(false);
  const [processandoParcial, setProcessandoParcial] = useState(false);
  const [pedidoFilho, setPedidoFilho] = useState(null);
  const [pedidoPai, setPedidoPai] = useState(null);

  // romaneio
  const [romaneioAberto, setRomaneioAberto] = useState(false);
  const [pedidosIrmaos, setPedidosIrmaos] = useState([]);
  const [selecionados, setSelecionados] = useState([]);

  const [editandoPagamento, setEditandoPagamento] = useState(null);
  const [edicaoPagamento, setEdicaoPagamento] = useState({});

  // nota fiscal
  const [numeroNF, setNumeroNF] = useState("");
  const [editandoNF, setEditandoNF] = useState(false);
  const [processandoNF, setProcessandoNF] = useState(false);
  const [marcandoDepoisModal, setMarcandoDepoisModal] = useState(false);
  const [motivoDepois, setMotivoDepois] = useState("");

  // liberar pro faturamento sem pagamento total
  const [modalSemPagamentoAberto, setModalSemPagamentoAberto] = useState(false);
  const [motivoSemPagamento, setMotivoSemPagamento] = useState("");
  const [processandoSemPagamento, setProcessandoSemPagamento] = useState(false);

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    setPerfil(await getPerfilAtual());
    const { data: orc } = await supabase
      .from("orcamentos")
      .select("*, clientes(id, nome, celular, email), unidades(nome, obriga_nota_fiscal), perfis!orcamentos_liberado_sem_pagamento_por_fkey(nome)")
      .eq("id", id)
      .single();
    const unidadeAtiva = getUnidadeAtiva();
    if (orc && unidadeAtiva && orc.unidade_id !== unidadeAtiva.id) {
      setOrcamento(null);
      setForaDaUnidade(true);
      return;
    }
    setOrcamento(orc);
    const { data: its } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", id).order("id");
    setItens(its || []);
    const { data: pags } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", id).order("registrado_em");
    setPagamentos(pags || []);
    if (orc?.parcial) {
      const { data: filho } = await supabase.from("orcamentos").select("id, status, numero_unidade").eq("pedido_pai_id", id).maybeSingle();
      setPedidoFilho(filho || null);
    }
    if (orc?.pedido_pai_id) {
      const { data: pai } = await supabase.from("orcamentos").select("id, numero_unidade").eq("id", orc.pedido_pai_id).maybeSingle();
      setPedidoPai(pai || null);
    }
    if (orc) {
      const totalPago = (pags || []).reduce((s, p) => s + Number(p.valor), 0);
      const faltando = Number(orc.valor_total || 0) - totalPago;
      setValorPagamento(faltando > 0 ? faltando.toFixed(2) : "");
    }
  }

  if (perfil === undefined || orcamento === undefined) {
    return <AppShell titulo="Pedido"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  const podeAcessarEstoquePedido =
    ["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"].includes(perfil?.cargo) ||
    (perfil?.cargo === "Vendedor" && !!orcamento && perfil.id === orcamento.vendedor_id);

  if (perfil && !podeAcessarEstoquePedido) {
    return (
      <AppShell titulo="Pedido">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente, Supervisor e Estoque acessam esta página (o Vendedor também acessa quando é o pedido dele).</p>
        </div>
      </AppShell>
    );
  }

  if (!orcamento) {
    return (
      <AppShell titulo="Pedido">
        <p className="text-sm text-muted">
          {foraDaUnidade
            ? "Esse pedido pertence a outra unidade. Troque de unidade pra acessá-lo."
            : "Pedido não encontrado."}
        </p>
      </AppShell>
    );
  }

  const cor = CORES_STATUS[orcamento.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
  const totalPagoGeral = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
  const faltandoGeral = Number(orcamento.valor_total || 0) - totalPagoGeral;
  const aindaSemPagamento = orcamento.sem_pagamento && faltandoGeral > 0.004;
  // a autorização dada em "Liberar sem pagamento" (Estoque) já libera também a entrega —
  // não pede uma segunda autorização pra confirmar a entrega ao cliente.
  const entregaAutorizadaSemPagamento = aindaSemPagamento && !!orcamento.liberado_sem_pagamento_por;
  const entregaBloqueadaPorPagamento = aindaSemPagamento && !orcamento.liberado_sem_pagamento_por;
  const podeLiberarSemPagamento =
    ["Administrador", "Diretor", "Gerente", "Supervisor"].includes(perfil?.cargo) ||
    (perfil?.cargo === "Vendedor" && perfil?.id === orcamento?.vendedor_id);
  const rotuloSemPagamento = rotuloPagamentoPendente(totalPagoGeral);
  const IconeAtual = ICONES_STATUS[orcamento.status];
  const podeInformarDelivery = ["Aguardando Separação/Compra", "Peças Compradas - Aguardando Chegada"].includes(orcamento.status);
  const todosLiberados = itens.length > 0 && itens.every((i) => i.liberado);

  function copiarCodigo(codigo) {
    navigator.clipboard.writeText(codigo);
    setCodigoCopiado(codigo);
    setTimeout(() => setCodigoCopiado(null), 1500);
  }

  // ---------- ações ----------

  async function registrarCompra() {
    if (!numeroPedidoCompra.trim()) return;
    setProcessando(true);
    setErro("");
    const { error } = await supabase
      .from("orcamentos")
      .update({ numero_pedido_compra: numeroPedidoCompra.trim(), status: "Peças Compradas - Aguardando Chegada" })
      .eq("id", id);
    setProcessando(false);
    if (error) { setErro("Falha ao registrar: " + error.message); return; }
    await registrarAuditoria({
      tipoEvento: "edicao",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Nº do pedido de compra registrado no pedido #${orcamento.numero_unidade}: ${numeroPedidoCompra.trim()}.`
    });
    carregar();
  }

  async function buscarDeliveryItem(item) {
    const valor = (deliveries[item.id] || "").trim();
    if (!valor) return;
    setBuscandoItem((b) => ({ ...b, [item.id]: true }));
    setErroItem((e) => ({ ...e, [item.id]: "" }));

    const unidadeAtiva = getUnidadeAtiva();
    const { data: lote } = await supabase
      .from("lotes_pecas")
      .select("*")
      .eq("codigo", item.codigo)
      .eq("no_entrega", valor)
      .eq("asc_cod_origem", unidadeAtiva?.asc_cod)
      .maybeSingle();

    if (!lote) {
      setBuscandoItem((b) => ({ ...b, [item.id]: false }));
      setErroItem((e) => ({
        ...e,
        [item.id]: `Delivery "${valor}" não encontrada pro código ${item.codigo} nesta unidade (${unidadeAtiva?.nome}). Peça pro Administrador atualizar a Base Peças, ou confira se a Delivery é de outra unidade.`
      }));
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamento_itens")
      .update({
        no_entrega: valor,
        custo_real: lote.valor_unitario,
        liberado: true,
        liberado_por: user.id,
        liberado_em: new Date().toISOString()
      })
      .eq("id", item.id);

    setBuscandoItem((b) => ({ ...b, [item.id]: false }));
    if (error) {
      setErroItem((e) => ({ ...e, [item.id]: "Falha ao salvar: " + error.message }));
      return;
    }

    const itensAtualizados = itens.map((i) => (i.id === item.id ? { ...i, no_entrega: valor, custo_real: lote.valor_unitario, liberado: true } : i));
    setItens(itensAtualizados);

    if (itensAtualizados.every((i) => i.liberado)) {
      setConfirmarAvanco({ de: orcamento.status, para: "Em Estoque - Aguardando Faturamento" });
    }
  }

  async function liberarParcialmente() {
    setProcessandoParcial(true);
    setErro("");

    const itensProntos = itens.filter((i) => i.liberado);
    const itensPendentes = itens.filter((i) => !i.liberado);
    if (itensProntos.length === 0 || itensPendentes.length === 0) {
      setProcessandoParcial(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const valorPendente = itensPendentes.reduce((s, i) => s + Number(i.venda_total || 0), 0);
    const valorPronto = itensProntos.reduce((s, i) => s + Number(i.venda_total || 0), 0);
    const statusFilho = orcamento.numero_pedido_compra ? "Peças Compradas - Aguardando Chegada" : "Aguardando Separação/Compra";

    // calcula quanto do que já foi pago no pedido original "pertence" proporcionalmente à parte que fica pendente
    const subtotalOriginal = valorPronto + valorPendente;
    const jaPagoNoOriginal = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento.valor_herdado_pai || 0);
    const proporcaoPendente = subtotalOriginal > 0 ? valorPendente / subtotalOriginal : 0;
    const herdadoParaFilho = Math.round(jaPagoNoOriginal * proporcaoPendente * 100) / 100;

    const { data: numeroReservado, error: errNumero } = await supabase.rpc("proximo_numero_pedido", { p_unidade_id: orcamento.unidade_id });
    if (errNumero) {
      setProcessandoParcial(false);
      setErro("Falha ao gerar o número do pedido: " + errNumero.message);
      return;
    }

    const { data: novoPedido, error: errNovo } = await supabase
      .from("orcamentos")
      .insert({
        cliente_id: orcamento.cliente_id,
        vendedor_id: orcamento.vendedor_id,
        criado_por: user.id,
        status: statusFilho,
        valor_total: valorPendente,
        margem: orcamento.margem,
        imposto_total: orcamento.imposto_total,
        numero_pedido_compra: orcamento.numero_pedido_compra,
        pedido_pai_id: id,
        valor_herdado_pai: herdadoParaFilho,
        unidade_id: orcamento.unidade_id,
        numero_unidade: numeroReservado
      })
      .select()
      .single();

    if (errNovo) {
      setProcessandoParcial(false);
      setErro("Falha ao separar peça pendente: " + errNovo.message);
      return;
    }

    const idsPendentes = itensPendentes.map((i) => i.id);
    const { error: errMove } = await supabase.from("orcamento_itens").update({ orcamento_id: novoPedido.id }).in("id", idsPendentes);
    if (errMove) {
      setProcessandoParcial(false);
      setErro("Falha ao mover peças pendentes: " + errMove.message);
      return;
    }

    const { error: errAtualiza } = await supabase
      .from("orcamentos")
      .update({ valor_total: valorPronto, status: "Em Estoque - Aguardando Faturamento", parcial: true })
      .eq("id", id);

    setProcessandoParcial(false);
    if (errAtualiza) {
      setErro("Falha ao atualizar o pedido: " + errAtualiza.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "criacao",
      entidade: "orcamentos",
      entidadeId: novoPedido.id,
      descricao: `Liberação parcial do pedido #${orcamento.numero_unidade}: peças pendentes viraram o pedido #${numeroReservado} (${fmtBRL(valorPendente)}).`
    });
    setConfirmarParcial(false);
    carregar();
  }

  async function confirmarAvancoStatus() {
    if (!confirmarAvanco) return;
    setProcessando(true);
    const statusAnterior = orcamento.status;
    const { error } = await supabase.from("orcamentos").update({ status: confirmarAvanco.para }).eq("id", id);
    if (!error && orcamento.pedido_pai_id) {
      await supabase.from("notificacoes").insert({
        tipo: "pedido_pendente_pronto",
        mensagem: `A peça pendente do pedido #${pedidoPai?.numero_unidade ?? orcamento.pedido_pai_id} chegou — pedido #${orcamento.numero_unidade} está em "${confirmarAvanco.para}".`
      });
    }
    setProcessando(false);
    setConfirmarAvanco(null);
    if (error) { setErro("Falha ao avançar etapa: " + error.message); return; }
    await registrarAuditoria({
      tipoEvento: "status",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Pedido #${orcamento.numero_unidade} avançou de status: ${statusAnterior} → ${confirmarAvanco.para}.`
    });
    carregar();
  }

  async function confirmarFaturamentoJaPago() {
    setProcessandoPagamento(true);
    setErro("");
    const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        valor_pago: totalPago,
        pagamento_validado_por: user.id,
        pagamento_validado_em: new Date().toISOString(),
        status: "Faturamento Efetuado",
        sem_pagamento: false
      })
      .eq("id", id);
    setProcessandoPagamento(false);
    if (error) {
      setErro("Falha ao confirmar faturamento: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "status",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Faturamento confirmado (já estava pago) no pedido #${orcamento.numero_unidade}: ${fmtBRL(totalPago)}.`
    });
    carregar();
  }

  async function liberarSemPagamento() {
    if (!motivoSemPagamento.trim()) {
      setErro("Precisa justificar antes de liberar sem pagamento.");
      return;
    }
    setProcessandoSemPagamento(true);
    setErro("");
    const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        status: "Faturamento Efetuado",
        valor_pago: totalPago,
        sem_pagamento: true,
        liberado_sem_pagamento_por: user.id,
        liberado_sem_pagamento_em: new Date().toISOString(),
        liberado_sem_pagamento_motivo: motivoSemPagamento.trim()
      })
      .eq("id", id);
    setProcessandoSemPagamento(false);
    if (error) {
      setErro("Falha ao liberar sem pagamento: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "status",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Pedido #${orcamento.numero_unidade} liberado para faturamento SEM pagamento total (pago até agora: ${fmtBRL(totalPago)} de ${fmtBRL(orcamento.valor_total)}). Motivo: ${motivoSemPagamento.trim()}.`
    });
    setModalSemPagamentoAberto(false);
    setMotivoSemPagamento("");
    carregar();
  }

  async function adicionarPagamentoModal() {
    const valor = parseFloat(valorPagamento);
    if (!valor || valor <= 0 || !dataPagamento) return;
    const jaPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
    const restante = Number(orcamento.valor_total) - jaPago;
    if (valor > restante + 0.004) {
      setErro(`O valor não pode ser maior que o restante do pedido (${fmtBRL(restante)}).`);
      return;
    }
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
    const completo = totalPago >= Number(orcamento.valor_total) - 0.01;

    if (completo && orcamento.status === "Em Estoque - Aguardando Faturamento") {
      await supabase
        .from("orcamentos")
        .update({
          valor_pago: totalPago,
          data_pagamento: dataPagamento,
          pagamento_validado_por: user.id,
          pagamento_validado_em: new Date().toISOString(),
          status: "Faturamento Efetuado",
          sem_pagamento: false
        })
        .eq("id", id);
    } else if (completo && orcamento.sem_pagamento) {
      await supabase.from("orcamentos").update({ valor_pago: totalPago, sem_pagamento: false }).eq("id", id);
    }

    setArquivoAnexo(null);
    setValorPagamento("");
    setProcessandoPagamento(false);
    await registrarAuditoria({
      tipoEvento: "pagamento",
      entidade: "pagamentos_orcamento",
      entidadeId: id,
      descricao: `Pagamento registrado no pedido #${orcamento.numero_unidade}: ${formaPagamento} — ${fmtBRL(valor)}.`
    });
    carregar();
  }

  async function excluirPagamento(pagamentoId) {
    setProcessando(true);
    await supabase.from("pagamentos_orcamento").delete().eq("id", pagamentoId);
    await registrarAuditoria({
      tipoEvento: "exclusao",
      entidade: "pagamentos_orcamento",
      entidadeId: pagamentoId,
      descricao: `Pagamento excluído do pedido #${orcamento.numero_unidade}.`
    });
    setProcessando(false);
    carregar();
  }

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
    await registrarAuditoria({
      tipoEvento: "edicao",
      entidade: "pagamentos_orcamento",
      entidadeId: pagamentoId,
      descricao: `Pagamento editado no pedido #${orcamento.numero_unidade}: ${edicaoPagamento.forma_pagamento} — ${fmtBRL(valor)}.`
    });
    setProcessando(false);
    setEditandoPagamento(null);
    carregar();
  }

  async function confirmarSeparacao() {
    setProcessando(true);
    setErro("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({ separado_por: user.id, separado_em: new Date().toISOString(), status: "Liberado para Retirada/Entrega" })
      .eq("id", id);
    setProcessando(false);
    if (error) { setErro("Falha ao confirmar separação: " + error.message); return; }
    await registrarAuditoria({
      tipoEvento: "status",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Separação confirmada no pedido #${orcamento.numero_unidade} — liberado para retirada/entrega.`
    });
    carregar();
  }

  async function registrarNotaFiscal() {
    const numero = numeroNF.trim();
    if (!numero) return;
    setProcessandoNF(true);
    setErro("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        nota_fiscal_numero: numero,
        nota_fiscal_emitida_por: user.id,
        nota_fiscal_emitida_em: new Date().toISOString(),
        nota_fiscal_emitir_depois: false
      })
      .eq("id", id);
    setProcessandoNF(false);
    if (error) {
      setErro(error.code === "23505" ? `Já existe outra NF com o número ${numero} registrada nesta unidade.` : "Falha ao registrar a Nota Fiscal: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "edicao",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Nota Fiscal nº ${numero} registrada no pedido #${orcamento.numero_unidade}.`
    });
    setNumeroNF("");
    setEditandoNF(false);
    carregar();
  }

  async function marcarNotaFiscalDepois() {
    setProcessandoNF(true);
    setErro("");
    const motivo = motivoDepois.trim();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        nota_fiscal_emitir_depois: true,
        nota_fiscal_marcada_depois_por: user.id,
        nota_fiscal_marcada_depois_em: new Date().toISOString(),
        nota_fiscal_observacao: motivo || null
      })
      .eq("id", id);
    setProcessandoNF(false);
    if (error) { setErro("Falha ao marcar: " + error.message); return; }
    await registrarAuditoria({
      tipoEvento: "edicao",
      entidade: "orcamentos",
      entidadeId: id,
      descricao: `Pedido #${orcamento.numero_unidade} marcado para emitir Nota Fiscal depois.${motivo ? ` Motivo: ${motivo}` : ""}`
    });
    setMarcandoDepoisModal(false);
    setMotivoDepois("");
    carregar();
  }

  async function abrirRomaneio() {
    const { data } = await supabase
      .from("orcamentos")
      .select("id, valor_total, criado_em")
      .eq("cliente_id", orcamento.cliente_id)
      .eq("unidade_id", orcamento.unidade_id)
      .eq("status", "Liberado para Retirada/Entrega")
      .eq("entregue", false);
    setPedidosIrmaos(data || []);
    setSelecionados([Number(id)]);
    setRomaneioAberto(true);
  }

  function alternarSelecao(pid) {
    setSelecionados((atual) => (atual.includes(pid) ? atual.filter((x) => x !== pid) : [...atual, pid]));
  }

  function imprimirRomaneio() {
    window.open(`/estoque/romaneio?ids=${selecionados.join(",")}`, "_blank");
  }

  async function confirmarEntregaFinal() {
    setProcessando(true);
    setErro("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({ entregue: true, entregue_por: user.id, entregue_em: new Date().toISOString() })
      .in("id", selecionados);
    setProcessando(false);
    if (error) { setErro("Falha ao confirmar entrega: " + error.message); return; }
    for (const pid of selecionados) {
      await registrarAuditoria({
        tipoEvento: "status",
        entidade: "orcamentos",
        entidadeId: pid,
        descricao: `Entrega confirmada no pedido #${pid === Number(id) ? orcamento.numero_unidade : pid} (romanéio).`
      });
    }
    setRomaneioAberto(false);
    carregar();
  }

  async function verComprovante(anexoUrl) {
    if (!anexoUrl) return;
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(anexoUrl, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  return (
    <AppShell titulo={`Pedido #${orcamento.numero_unidade}`}>
      <button onClick={() => router.push("/estoque")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para Estoque
      </button>

      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-display font-semibold text-lg">{orcamento.clientes?.nome}</p>
            <p className="text-sm text-muted">{orcamento.clientes?.celular || orcamento.clientes?.email || ""}</p>
          </div>
          <span className="text-sm font-mono font-bold px-4 py-2 rounded-full inline-flex items-center gap-2" style={{ background: cor.bg, color: cor.fg }}>
            {IconeAtual && <IconeAtual size={17} />}
            {orcamento.status}
          </span>
        </div>
        {orcamento.numero_pedido_compra && (
          <p className="text-xs text-muted mt-3">Nº do pedido de compra: <span className="font-mono">{orcamento.numero_pedido_compra}</span></p>
        )}
        {orcamento.valor_pago && orcamento.status !== "Em Estoque - Aguardando Faturamento" && (
          <p className="text-xs text-muted mt-1">
            Pago: <span className="font-mono">{fmtBRL(orcamento.valor_pago)}</span> em {orcamento.data_pagamento && new Date(orcamento.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>
        )}
        {orcamento.entregue && (
          <p className="text-xs mt-2 font-medium" style={{ color: "#2C7C6E" }}>
            ✓ Entregue em {new Date(orcamento.entregue_em).toLocaleDateString("pt-BR")}
          </p>
        )}
        {orcamento.status === "Cancelado" && (
          <div className="mt-3 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">
            Pedido cancelado{orcamento.cancelado_em ? ` em ${new Date(orcamento.cancelado_em).toLocaleString("pt-BR")}` : ""}.
            {orcamento.motivo_cancelamento && <> Motivo: {orcamento.motivo_cancelamento}</>}
          </div>
        )}
        {!orcamento.entregue && orcamento.status !== "Cancelado" && (
          <button
            onClick={() => setCancelandoPedido(true)}
            className="text-sm mt-3 hover:underline flex items-center gap-1.5"
            style={{ color: "var(--danger)" }}
          >
            <XCircle size={14} />
            Cancelar pedido / registrar desistência
          </button>
        )}
        {aindaSemPagamento && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2"
            style={{ background: rotuloSemPagamento.bg, color: rotuloSemPagamento.fg }}
          >
            <AlertTriangle size={14} />
            {rotuloSemPagamento.texto} — faltam {fmtBRL(faltandoGeral)}.
            {entregaAutorizadaSemPagamento
              ? ` Liberado para entrega mesmo assim por ${orcamento.perfis?.nome ?? "usuário"}.`
              : " Precisa quitar antes de liberar a entrega."}
          </div>
        )}
        {orcamento.pedido_pai_id && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(122,79,176,0.10)", color: "#7A4FB0" }}>
            Este pedido é uma peça pendente separada do{" "}
            <button onClick={() => router.push(`/estoque/${orcamento.pedido_pai_id}`)} className="underline font-medium">
              pedido #{pedidoPai?.numero_unidade ?? orcamento.pedido_pai_id}
            </button>.
            {Number(orcamento.valor_herdado_pai) > 0 && (
              <span className="block mt-1">
                <b>{fmtBRL(orcamento.valor_herdado_pai)}</b> já foi pago lá e conta aqui automaticamente.
              </span>
            )}
          </div>
        )}
        {orcamento.parcial && pedidoFilho && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2" style={{ background: "rgba(232,163,61,0.12)", color: "#C2801F" }}>
            <span>
              Liberado parcialmente — a peça pendente virou o{" "}
              <button onClick={() => router.push(`/estoque/${pedidoFilho.id}`)} className="underline font-medium">
                pedido #{pedidoFilho.numero_unidade}
              </button>{" "}
              ({pedidoFilho.status}).
            </span>
          </div>
        )}
      </div>

      {orcamento.status === "Aguardando Separação/Compra" && (
        <div className="card p-5 mb-4">
          <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
            <Package size={16} style={{ color: "var(--accent)" }} />
            Precisa comprar?
          </p>
          <p className="text-xs text-muted mb-3">
            Informe o número do pedido de compra feito à Samsung (vale pro pedido inteiro). Se já tiver alguma peça em estoque, pode informar a Delivery dela direto na tabela abaixo, sem precisar comprar.
          </p>
          <div className="flex gap-2 max-w-md">
            <input className="field-input" placeholder="Nº do pedido de compra" value={numeroPedidoCompra} onChange={(e) => setNumeroPedidoCompra(e.target.value)} />
            <button className="btn-primary shrink-0" disabled={processando || !numeroPedidoCompra.trim()} onClick={registrarCompra}>Registrar</button>
          </div>
        </div>
      )}

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
              <th className="text-left px-3 py-2.5" style={{ width: "28%" }}>Peça</th>
              <th className="text-center px-3 py-2.5" style={{ width: "8%" }}>Qtd</th>
              <th className="text-left px-3 py-2.5" style={{ width: "20%" }}>Delivery</th>
              <th className="text-right px-3 py-2.5" style={{ width: "18%" }}>Custo</th>
              <th className="text-right px-3 py-2.5" style={{ width: "16%" }}>Venda</th>
              <th className="text-center px-3 py-2.5" style={{ width: "10%" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const corCat = corCategoria(i.categoria);
              const Icone = iconeCategoria(i.categoria);
              const custoTotalItem = Number(i.custo_real || 0) * i.qtd;
              return (
                <tr key={i.id} className="border-b border-line last:border-0 align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-mono font-medium text-xs truncate">{i.modelo}</p>
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs" style={{ color: "var(--accent)" }}>
                      <Icone size={11} style={{ color: corCat.fg }} />
                      {i.codigo}
                      <button
                        onClick={() => copiarCodigo(i.codigo)}
                        title="Copiar código"
                        className="text-muted hover:text-ink"
                      >
                        {codigoCopiado === i.codigo ? <Check size={11} style={{ color: "#2C7C6E" }} /> : <Copy size={11} />}
                      </button>
                    </span>
                    <p className="text-muted text-xs truncate">{i.descricao_resumida}</p>
                  </td>
                  <td className="px-3 py-2.5 text-center">{i.qtd}</td>
                  <td className="px-3 py-2.5">
                    {i.liberado ? (
                      <span className="font-mono text-xs">{i.no_entrega}</span>
                    ) : podeInformarDelivery ? (
                      <div className="flex items-center gap-1">
                        <input
                          className="field-input py-1.5 text-xs w-full"
                          placeholder="nº delivery"
                          value={deliveries[i.id] || ""}
                          onChange={(e) => setDeliveries((atual) => ({ ...atual, [i.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => buscarDeliveryItem(i)}
                          disabled={buscandoItem[i.id] || !deliveries[i.id]}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas shrink-0"
                        >
                          {buscandoItem[i.id] ? <RefreshCw size={13} className="animate-spin" /> : <Search size={13} />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                    {erroItem[i.id] && (
                      <p className="text-[10px] text-danger mt-1 leading-snug">{erroItem[i.id]}</p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-xs">
                    <p>{fmtBRL(i.custo_real)} un.</p>
                    <p className="font-semibold">{fmtBRL(custoTotalItem)}</p>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-sm" style={{ color: "#2C7C6E" }}>{fmtBRL(i.venda_total)}</td>
                  <td className="px-3 py-2.5 text-center">
                    {i.liberado ? <Check size={16} style={{ color: "#2C7C6E" }} className="inline" /> : <AlertTriangle size={16} className="text-muted inline" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-canvas font-semibold">
              <td className="px-3 py-2.5" colSpan={3}>Total</td>
              <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtBRL(itens.reduce((s, i) => s + Number(i.custo_real || 0) * i.qtd, 0))}</td>
              <td className="px-3 py-2.5 text-right font-mono text-sm" style={{ color: "#2C7C6E" }}>{fmtBRL(itens.reduce((s, i) => s + Number(i.venda_total || 0), 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {podeInformarDelivery && !todosLiberados && (
        <div className="flex items-center justify-between flex-wrap gap-3 -mt-2 mb-4">
          <p className="text-xs text-muted">
            Assim que todas as peças tiverem Delivery confirmada, o pedido avança sozinho pro Faturamento.
          </p>
          {itens.some((i) => i.liberado) && (
            <button className="btn-secondary text-xs py-2" onClick={() => setConfirmarParcial(true)}>
              Liberar Parcialmente
            </button>
          )}
        </div>
      )}

      {orcamento.status === "Em Estoque - Aguardando Faturamento" && (() => {
        const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
        const faltando = Number(orcamento.valor_total) - totalPago;
        return (
          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-display font-semibold text-sm flex items-center gap-2 mb-1">
                  <Receipt size={16} style={{ color: "var(--accent)" }} />
                  Faturamento
                </p>
                <p className="text-xs text-muted">
                  Total pago: <b className="font-mono text-ink">{fmtBRL(totalPago)}</b>
                  {orcamento.pedido_pai_id && Number(orcamento.valor_herdado_pai) > 0 && (
                    <span> (inclui {fmtBRL(orcamento.valor_herdado_pai)} já pago no pedido #{pedidoPai?.numero_unidade ?? orcamento.pedido_pai_id})</span>
                  )}
                  {" · "}
                  {faltando > 0.004 ? (
                    <span className="font-semibold text-danger">Faltam {fmtBRL(faltando)}</span>
                  ) : (
                    <span className="font-semibold" style={{ color: "#2C7C6E" }}>Valor completo ✓</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {faltando > 0.004 && podeLiberarSemPagamento && (
                  <button
                    className="btn-secondary"
                    style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
                    onClick={() => setModalSemPagamentoAberto(true)}
                    disabled={processandoSemPagamento}
                  >
                    <AlertTriangle size={15} />
                    Liberar sem pagamento
                  </button>
                )}
                <button className="btn-primary" onClick={faltando <= 0.004 ? confirmarFaturamentoJaPago : () => setPagamentoModalAberto(true)} disabled={processandoPagamento}>
                  {faltando <= 0.004 ? (
                    <>
                      <Check size={15} />
                      {processandoPagamento ? "Confirmando..." : "Confirmar Faturamento (já pago)"}
                    </>
                  ) : (
                    <>
                      <Plus size={15} />
                      Inserir Pagamento
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <Modal
        open={modalSemPagamentoAberto}
        onClose={() => { setModalSemPagamentoAberto(false); setMotivoSemPagamento(""); }}
        title="Liberar sem pagamento total"
        tamanho="md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg" style={{ background: "var(--danger-soft, #FDECEC)" }}>
            <AlertTriangle size={16} className="text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-ink">
              Este pedido será liberado para faturamento mesmo sem o pagamento total confirmado. Essa ação fica registrada na linha do tempo com seu login e o motivo informado abaixo.
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted block mb-1.5">Justificativa (obrigatória)</label>
            <textarea
              className="input"
              rows={3}
              value={motivoSemPagamento}
              onChange={(e) => setMotivoSemPagamento(e.target.value)}
              placeholder="Explique o motivo da liberação sem pagamento total..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => { setModalSemPagamentoAberto(false); setMotivoSemPagamento(""); }}>
              Cancelar
            </button>
            <button
              className="btn-primary"
              onClick={liberarSemPagamento}
              disabled={processandoSemPagamento || !motivoSemPagamento.trim()}
            >
              <Check size={15} />
              {processandoSemPagamento ? "Liberando..." : "Confirmar liberação"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={pagamentoModalAberto}
        onClose={() => setPagamentoModalAberto(false)}
        title="Registrar pagamento"
        tamanho="lg"
      >
        {faltandoGeral <= 0.004 ? (
          <div className="text-center py-4">
            <Check size={32} className="mx-auto mb-3" style={{ color: "#2C7C6E" }} />
            <p className="font-display font-semibold mb-1">Pagamento completo!</p>
            <p className="text-sm text-muted mb-5">O valor do pedido já está totalmente pago.</p>
            <button className="btn-primary" onClick={() => setPagamentoModalAberto(false)}>Fechar</button>
          </div>
        ) : (() => {
          const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0) + Number(orcamento?.valor_herdado_pai || 0);
          const faltando = Number(orcamento.valor_total) - totalPago;
          return (
            <>
              <p className="text-xs text-muted mb-4">
                Valor do pedido: <b className="text-ink">{fmtBRL(orcamento.valor_total)}</b>. Pode registrar quantas formas de pagamento precisar (ex: parte PIX, parte cartão).
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
                                  <button onClick={() => verComprovante(p.anexo_url)} className="text-muted hover:text-ink" title="Ver comprovante">
                                    <ExternalLink size={13} />
                                  </button>
                                )}
                                <button onClick={() => excluirPagamento(p.id)} className="text-muted hover:text-danger" title="Excluir">
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
                <span className="text-xs text-muted">Total pago: <b className="font-mono text-ink">{fmtBRL(totalPago)}</b></span>
                {faltando > 0.004 ? (
                  <span className="text-xs font-semibold text-danger">Faltam {fmtBRL(faltando)}</span>
                ) : (
                  <span className="text-xs font-semibold" style={{ color: "#2C7C6E" }}>Valor completo ✓</span>
                )}
              </div>

              {faltando > 0.004 && (
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
                      <input type="number" step="0.01" max={faltando > 0 ? faltando.toFixed(2) : undefined} className="field-input" value={valorPagamento} onChange={(e) => setValorPagamento(e.target.value)} />
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
                    onClick={adicionarPagamentoModal}
                  >
                    <Plus size={15} />
                    {processandoPagamento ? "Salvando..." : "Adicionar pagamento"}
                  </button>
                </>
              )}

              {erro && <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
            </>
          );
        })()}
      </Modal>

      {orcamento.status === "Faturamento Efetuado" && (
        <div className="card p-5 mb-4 flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-sm">Separar peças</p>
            <p className="text-xs text-muted mt-0.5">Confirme quando o estoquista separar fisicamente as peças.</p>
          </div>
          <button className="btn-primary" disabled={processando} onClick={confirmarSeparacao}>
            <PackageCheck size={15} />
            Confirmar separação
          </button>
        </div>
      )}

      {STATUS_ELEGIVEIS_NF.includes(orcamento.status) && (() => {
        const statusNF = statusNotaFiscal(orcamento);
        const resumo = RESUMO_STATUS_NF[statusNF];
        const obrigaNF = orcamento.unidades?.obriga_nota_fiscal !== false;
        return (
          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
              <p className="font-display font-semibold text-sm flex items-center gap-2">
                <FileCheck2 size={16} style={{ color: "var(--accent)" }} />
                Nota Fiscal
                {!obrigaNF && <span className="text-[10px] font-mono font-normal text-muted">(opcional nesta unidade)</span>}
              </p>
              <span className="text-[10.5px] font-mono font-bold px-2.5 py-1 rounded-full" style={{ background: resumo.bg, color: resumo.fg }}>
                {resumo.texto}
              </span>
            </div>

            {statusNF === "emitida" && !editandoNF ? (
              <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                <p className="text-xs text-muted">
                  Nº <span className="font-mono font-semibold text-ink">{orcamento.nota_fiscal_numero}</span>
                  {orcamento.nota_fiscal_emitida_em && <> — emitida em {new Date(orcamento.nota_fiscal_emitida_em).toLocaleString("pt-BR")}</>}
                </p>
                <button
                  className="text-xs text-muted hover:text-ink flex items-center gap-1"
                  onClick={() => { setNumeroNF(orcamento.nota_fiscal_numero || ""); setEditandoNF(true); }}
                >
                  <Pencil size={12} />
                  Corrigir número
                </button>
              </div>
            ) : (
              <>
                {statusNF === "marcada_depois" && (
                  <p className="text-xs mt-1 mb-3 flex items-center gap-1.5" style={{ color: "#C2801F" }}>
                    <Clock size={13} />
                    Marcado pra emitir depois{orcamento.nota_fiscal_observacao ? ` — ${orcamento.nota_fiscal_observacao}` : ""}. Registre o número assim que a NF sair.
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2 max-w-md">
                  <input
                    className="field-input font-mono"
                    placeholder="Nº da Nota Fiscal"
                    inputMode="numeric"
                    value={numeroNF}
                    onChange={(e) => setNumeroNF(e.target.value.replace(/\D/g, "").slice(0, 12))}
                  />
                  <button className="btn-primary shrink-0" disabled={processandoNF || !numeroNF.trim()} onClick={registrarNotaFiscal}>
                    <Check size={15} />
                    Registrar
                  </button>
                </div>
                {statusNF === "pendente" && (
                  <button className="text-xs text-muted hover:text-ink mt-2 flex items-center gap-1.5" disabled={processandoNF} onClick={() => { setMotivoDepois(""); setMarcandoDepoisModal(true); }}>
                    <Clock size={13} />
                    Ainda não saiu — marcar pra emitir depois
                  </button>
                )}
                {editandoNF && (
                  <button className="text-xs text-muted hover:text-ink mt-2 ml-3" onClick={() => { setEditandoNF(false); setNumeroNF(""); }}>
                    Cancelar
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {orcamento.status === "Liberado para Retirada/Entrega" && !orcamento.entregue && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display font-semibold text-sm">Pronto pra entrega</p>
              <p className="text-xs text-muted mt-0.5">
                {entregaBloqueadaPorPagamento
                  ? "Ainda falta pagamento — quite antes de confirmar a entrega."
                  : entregaAutorizadaSemPagamento
                  ? `Liberado sem pagamento total (faltam ${fmtBRL(faltandoGeral)}) — pode gerar o romaneio e confirmar a entrega.`
                  : "Gere o romaneio e confirme a entrega ao cliente."}
              </p>
            </div>
            <div className="flex gap-2">
              {aindaSemPagamento && (
                <button className="btn-secondary" onClick={() => setPagamentoModalAberto(true)}>
                  <Receipt size={15} />
                  Registrar pagamento
                </button>
              )}
              <button className="btn-primary" disabled={entregaBloqueadaPorPagamento} onClick={abrirRomaneio} title={entregaBloqueadaPorPagamento ? "Quite o pagamento antes de liberar a entrega" : ""}>
                <Send size={15} />
                Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2 mb-4">{erro}</div>}

      <LinhaDoTempo orcamento={orcamento} itens={itens} pagamentos={pagamentos} numeroPedidoPai={pedidoPai?.numero_unidade} />

      <Modal
        open={!!confirmarAvanco}
        onClose={() => setConfirmarAvanco(null)}
        title="Todas as peças foram liberadas"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarAvanco(null)}>Ainda não</button>
            <button className="btn-primary" disabled={processando} onClick={confirmarAvancoStatus}>Confirmar avanço</button>
          </>
        }
      >
        {confirmarAvanco && (
          <>
            <div className="flex items-center gap-2.5 flex-wrap mb-4">
              <span
                className="text-xs font-mono font-bold px-3 py-1.5 rounded-full"
                style={{ background: (CORES_STATUS[confirmarAvanco.de] || {}).bg, color: (CORES_STATUS[confirmarAvanco.de] || {}).fg }}
              >
                {confirmarAvanco.de}
              </span>
              <ArrowRight size={16} className="text-muted shrink-0" />
              <span
                className="text-xs font-mono font-bold px-3 py-1.5 rounded-full"
                style={{ background: (CORES_STATUS[confirmarAvanco.para] || {}).bg, color: (CORES_STATUS[confirmarAvanco.para] || {}).fg }}
              >
                {confirmarAvanco.para}
              </span>
            </div>
            <p className="text-sm text-muted">
              Todas as peças do pedido #{orcamento.numero_unidade} já têm Delivery confirmada. Confirma o avanço pra próxima etapa?
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={confirmarParcial}
        onClose={() => setConfirmarParcial(false)}
        title="Liberar parcialmente?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarParcial(false)}>Cancelar</button>
            <button className="btn-primary" disabled={processandoParcial} onClick={liberarParcialmente}>Confirmar liberação parcial</button>
          </>
        }
      >
        <div className="flex items-center gap-2.5 flex-wrap mb-4">
          <span
            className="text-xs font-mono font-bold px-3 py-1.5 rounded-full"
            style={{ background: (CORES_STATUS[orcamento.status] || {}).bg, color: (CORES_STATUS[orcamento.status] || {}).fg }}
          >
            {orcamento.status}
          </span>
          <ArrowRight size={16} className="text-muted shrink-0" />
          <span
            className="text-xs font-mono font-bold px-3 py-1.5 rounded-full"
            style={{ background: CORES_STATUS["Em Estoque - Aguardando Faturamento"].bg, color: CORES_STATUS["Em Estoque - Aguardando Faturamento"].fg }}
          >
            Em Estoque - Aguardando Faturamento
          </span>
        </div>
        <p className="text-sm text-muted mb-3">
          As peças abaixo seguem agora pro Faturamento. As demais viram um pedido novo, separado, pra acompanhar até a delivery chegar.
        </p>
        <div className="space-y-1.5 mb-3">
          <p className="text-xs font-semibold" style={{ color: "#2C7C6E" }}>Seguem agora ({itens.filter((i) => i.liberado).length})</p>
          {itens.filter((i) => i.liberado).map((i) => (
            <p key={i.id} className="text-xs text-muted pl-2">{i.codigo} — {i.descricao_resumida}</p>
          ))}
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-danger">Ficam pendentes ({itens.filter((i) => !i.liberado).length})</p>
          {itens.filter((i) => !i.liberado).map((i) => (
            <p key={i.id} className="text-xs text-muted pl-2">{i.codigo} — {i.descricao_resumida}</p>
          ))}
        </div>
      </Modal>

      <Modal
        open={romaneioAberto}
        onClose={() => setRomaneioAberto(false)}
        title="Confirmar entrega"
        footer={
          <>
            <button className="btn-secondary" onClick={imprimirRomaneio}>Ver / Imprimir Romaneio</button>
            <button className="btn-primary" disabled={processando || selecionados.length === 0} onClick={confirmarEntregaFinal}>
              Confirmar Entrega ({selecionados.length})
            </button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">
          Este pedido e outros do mesmo cliente já liberados pra retirada podem ser entregues juntos, no mesmo romaneio.
        </p>
        <div className="space-y-2">
          {pedidosIrmaos.map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-line cursor-pointer">
              <input type="checkbox" checked={selecionados.includes(p.id)} onChange={() => alternarSelecao(p.id)} />
              <span className="text-sm">Pedido #{p.numero_unidade} — {fmtBRL(p.valor_total)}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={marcandoDepoisModal}
        onClose={() => !processandoNF && setMarcandoDepoisModal(false)}
        title="Marcar Nota Fiscal pra emitir depois"
        footer={
          <>
            <button className="btn-secondary" disabled={processandoNF} onClick={() => setMarcandoDepoisModal(false)}>Cancelar</button>
            <button className="btn-primary" disabled={processandoNF} onClick={marcarNotaFiscalDepois}>
              {processandoNF ? "Salvando..." : "Confirmar"}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">
          O pedido #{orcamento.numero_unidade} continua sem NF registrada, mas fica marcado como "emitir depois" — ele entra no controle de pendências do menu Fiscal até você registrar o número.
        </p>
        <label className="field-label">Motivo (opcional)</label>
        <textarea
          className="field-input"
          rows={2}
          value={motivoDepois}
          onChange={(e) => setMotivoDepois(e.target.value)}
          placeholder="Ex: aguardando XML da Samsung"
        />
      </Modal>

      <CancelarPedidoModal
        open={cancelandoPedido}
        onClose={() => setCancelandoPedido(false)}
        orcamento={orcamento}
        totalPago={totalPagoGeral}
        onCancelado={carregar}
      />
    </AppShell>
  );
}
