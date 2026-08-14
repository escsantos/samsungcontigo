"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ShieldAlert, Search, Check, AlertTriangle, Package,
  Receipt, Paperclip, PackageCheck, Send, ExternalLink, RefreshCw, Plus, Trash2, Copy, ArrowRight
} from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { CORES_STATUS, ICONES_STATUS, FORMAS_PAGAMENTO } from "../../../lib/estoque";

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

  // romaneio
  const [romaneioAberto, setRomaneioAberto] = useState(false);
  const [pedidosIrmaos, setPedidosIrmaos] = useState([]);
  const [selecionados, setSelecionados] = useState([]);

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    setPerfil(await getPerfilAtual());
    const { data: orc } = await supabase.from("orcamentos").select("*, clientes(id, nome, celular, email)").eq("id", id).single();
    setOrcamento(orc);
    const { data: its } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", id).order("id");
    setItens(its || []);
    const { data: pags } = await supabase.from("pagamentos_orcamento").select("*").eq("orcamento_id", id).order("registrado_em");
    setPagamentos(pags || []);
    if (orc?.parcial) {
      const { data: filho } = await supabase.from("orcamentos").select("id, status").eq("pedido_pai_id", id).maybeSingle();
      setPedidoFilho(filho || null);
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

  if (perfil && !["Administrador", "Diretor", "Gerente", "Estoque"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Pedido">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente e Estoque acessam esta página.</p>
        </div>
      </AppShell>
    );
  }

  if (!orcamento) {
    return <AppShell titulo="Pedido"><p className="text-sm text-muted">Pedido não encontrado.</p></AppShell>;
  }

  const cor = CORES_STATUS[orcamento.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
  const totalPagoGeral = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
  const faltandoGeral = Number(orcamento.valor_total || 0) - totalPagoGeral;
  const aindaSemPagamento = orcamento.sem_pagamento && faltandoGeral > 0.004;
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
    carregar();
  }

  async function buscarDeliveryItem(item) {
    const valor = (deliveries[item.id] || "").trim();
    if (!valor) return;
    setBuscandoItem((b) => ({ ...b, [item.id]: true }));
    setErroItem((e) => ({ ...e, [item.id]: "" }));

    const { data: lote } = await supabase
      .from("lotes_pecas")
      .select("*")
      .eq("codigo", item.codigo)
      .eq("no_entrega", valor)
      .maybeSingle();

    if (!lote) {
      setBuscandoItem((b) => ({ ...b, [item.id]: false }));
      setErroItem((e) => ({
        ...e,
        [item.id]: `Delivery "${valor}" não encontrada pro código ${item.codigo}. Peça pro Administrador atualizar a Base Peças.`
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
      if (orcamento.pedido_pai_id) {
        // pedido filho (peça pendente que acabou de chegar): avança e avisa sozinho, sem faturamento manual de novo
        await supabase.from("orcamentos").update({ status: "Liberado para Retirada/Entrega" }).eq("id", id);
        await supabase.from("notificacoes").insert({
          tipo: "pedido_pendente_pronto",
          mensagem: `A peça pendente do pedido #${orcamento.pedido_pai_id} chegou — pedido #${id} está pronto para retirada/entrega.`
        });
        carregar();
      } else {
        setConfirmarAvanco({ de: orcamento.status, para: "Em Estoque - Aguardando Faturamento" });
      }
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
    const statusFilho = orcamento.numero_pedido_compra ? "Peças Compradas - Aguardando Chegada" : "Aguardando Separação/Compra";

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
        pedido_pai_id: id
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

    const valorPronto = itensProntos.reduce((s, i) => s + Number(i.venda_total || 0), 0);
    const { error: errAtualiza } = await supabase
      .from("orcamentos")
      .update({ valor_total: valorPronto, status: "Em Estoque - Aguardando Faturamento", parcial: true })
      .eq("id", id);

    setProcessandoParcial(false);
    if (errAtualiza) {
      setErro("Falha ao atualizar o pedido: " + errAtualiza.message);
      return;
    }
    setConfirmarParcial(false);
    carregar();
  }

  async function confirmarAvancoStatus() {
    if (!confirmarAvanco) return;
    setProcessando(true);
    const { error } = await supabase.from("orcamentos").update({ status: confirmarAvanco.para }).eq("id", id);
    setProcessando(false);
    setConfirmarAvanco(null);
    if (error) { setErro("Falha ao avançar etapa: " + error.message); return; }
    carregar();
  }

  async function adicionarPagamentoModal() {
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
    carregar();
  }

  async function excluirPagamento(pagamentoId) {
    setProcessando(true);
    await supabase.from("pagamentos_orcamento").delete().eq("id", pagamentoId);
    setProcessando(false);
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
    carregar();
  }

  async function abrirRomaneio() {
    const { data } = await supabase
      .from("orcamentos")
      .select("id, valor_total, criado_em")
      .eq("cliente_id", orcamento.cliente_id)
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
    setRomaneioAberto(false);
    carregar();
  }

  async function verComprovante(anexoUrl) {
    if (!anexoUrl) return;
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(anexoUrl, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
  }

  return (
    <AppShell titulo={`Pedido #${orcamento.id}`}>
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
        {aindaSemPagamento && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-2"
            style={{ background: "rgba(214,51,108,0.12)", color: "#D6336C" }}
          >
            <AlertTriangle size={14} />
            SEM PAGAMENTO — faltam {fmtBRL(faltandoGeral)}. Precisa quitar antes de liberar a entrega.
          </div>
        )}
        {orcamento.pedido_pai_id && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs" style={{ background: "rgba(122,79,176,0.10)", color: "#7A4FB0" }}>
            Este pedido é uma peça pendente separada do{" "}
            <button onClick={() => router.push(`/estoque/${orcamento.pedido_pai_id}`)} className="underline font-medium">
              pedido #{orcamento.pedido_pai_id}
            </button>.
          </div>
        )}
        {orcamento.parcial && pedidoFilho && (
          <div className="mt-3 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2" style={{ background: "rgba(232,163,61,0.12)", color: "#C2801F" }}>
            <span>
              Liberado parcialmente — a peça pendente virou o{" "}
              <button onClick={() => router.push(`/estoque/${pedidoFilho.id}`)} className="underline font-medium">
                pedido #{pedidoFilho.id}
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
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
              <th className="text-left px-4 py-2.5">Modelo</th>
              <th className="text-left px-4 py-2.5">Código</th>
              <th className="text-left px-4 py-2.5">Descrição</th>
              <th className="text-center px-4 py-2.5">Qtd</th>
              <th className="text-left px-4 py-2.5">Delivery</th>
              <th className="text-right px-4 py-2.5">Custo real (un.)</th>
              <th className="text-right px-4 py-2.5">Custo Total</th>
              <th className="text-right px-4 py-2.5">Venda</th>
              <th className="text-center px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const corCat = corCategoria(i.categoria);
              const Icone = iconeCategoria(i.categoria);
              const custoTotalItem = Number(i.custo_real || 0) * i.qtd;
              return (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-mono font-medium">{i.modelo}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: "var(--accent)" }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Icone size={11} style={{ color: corCat.fg }} />
                      {i.codigo}
                      <button
                        onClick={() => copiarCodigo(i.codigo)}
                        title="Copiar código"
                        className="text-muted hover:text-ink"
                      >
                        {codigoCopiado === i.codigo ? <Check size={12} style={{ color: "#2C7C6E" }} /> : <Copy size={12} />}
                      </button>
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{i.descricao_resumida}</td>
                  <td className="px-4 py-2.5 text-center">{i.qtd}</td>
                  <td className="px-4 py-2.5">
                    {i.liberado ? (
                      <span className="font-mono text-xs">{i.no_entrega}</span>
                    ) : podeInformarDelivery ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="field-input py-1.5 text-xs w-28"
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
                      <p className="text-[10.5px] text-danger mt-1 max-w-[220px] leading-snug">{erroItem[i.id]}</p>
                    )}
                    </td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(i.custo_real)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(custoTotalItem)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(i.venda_total)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {i.liberado ? <Check size={16} style={{ color: "#2C7C6E" }} className="inline" /> : <AlertTriangle size={16} className="text-muted inline" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line bg-canvas font-semibold">
              <td className="px-4 py-2.5" colSpan={5}>Total</td>
              <td></td>
              <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(itens.reduce((s, i) => s + Number(i.custo_real || 0) * i.qtd, 0))}</td>
              <td className="px-4 py-2.5 text-right font-mono" style={{ color: "#2C7C6E" }}>{fmtBRL(itens.reduce((s, i) => s + Number(i.venda_total || 0), 0))}</td>
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
        const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
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
                  {" · "}
                  {faltando > 0.004 ? (
                    <span className="font-semibold text-danger">Faltam {fmtBRL(faltando)}</span>
                  ) : (
                    <span className="font-semibold" style={{ color: "#2C7C6E" }}>Valor completo ✓</span>
                  )}
                </p>
              </div>
              <button className="btn-primary" onClick={() => setPagamentoModalAberto(true)}>
                <Plus size={15} />
                Inserir Pagamento
              </button>
            </div>
          </div>
        );
      })()}

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
          const totalPago = pagamentos.reduce((s, p) => s + Number(p.valor), 0);
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
                      {pagamentos.map((p) => (
                        <tr key={p.id} className="border-b border-line last:border-0">
                          <td className="px-3 py-2">{p.forma_pagamento}</td>
                          <td className="px-3 py-2 text-muted">{new Date(p.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                          <td className="px-3 py-2 text-right font-mono">{fmtBRL(p.valor)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
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
                      ))}
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

      {orcamento.status === "Liberado para Retirada/Entrega" && !orcamento.entregue && (
        <div className="card p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-display font-semibold text-sm">Pronto pra entrega</p>
              <p className="text-xs text-muted mt-0.5">
                {aindaSemPagamento
                  ? "Ainda falta pagamento — quite antes de confirmar a entrega."
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
              <button className="btn-primary" disabled={aindaSemPagamento} onClick={abrirRomaneio} title={aindaSemPagamento ? "Quite o pagamento antes de liberar a entrega" : ""}>
                <Send size={15} />
                Confirmar Entrega
              </button>
            </div>
          </div>
        </div>
      )}

      {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

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
              Todas as peças do pedido #{orcamento.id} já têm Delivery confirmada. Confirma o avanço pra próxima etapa?
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
              <span className="text-sm">Pedido #{p.id} — {fmtBRL(p.valor_total)}</span>
            </label>
          ))}
        </div>
      </Modal>
    </AppShell>
  );
}
