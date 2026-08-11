"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, ShieldAlert, Search, Check, AlertTriangle, Package, Truck,
  Receipt, Paperclip, PackageCheck, Send, ExternalLink
} from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { CORES_STATUS, ICONES_STATUS } from "../../../lib/estoque";

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

  // etapa "Aguardando Separação/Compra"
  const [numeroPedidoCompra, setNumeroPedidoCompra] = useState("");
  const [deliveryAdiantada, setDeliveryAdiantada] = useState("");

  // etapa "Peças Compradas"
  const [deliveryChegada, setDeliveryChegada] = useState("");

  // etapa "Em Estoque - Aguardando Faturamento"
  const [valorPago, setValorPago] = useState("");
  const [dataPagamento, setDataPagamento] = useState(hoje());
  const [arquivoAnexo, setArquivoAnexo] = useState(null);
  const [linkComprovante, setLinkComprovante] = useState("");

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
    if (orc) setValorPago(String(orc.valor_total || ""));
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
  const IconeAtual = ICONES_STATUS[orcamento.status];

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

  async function processarDelivery(delivery, statusDestino) {
    if (!delivery.trim()) return false;
    setProcessando(true);
    setErro("");

    const resultados = [];
    for (const item of itens) {
      const { data: lote } = await supabase
        .from("lotes_pecas")
        .select("*")
        .eq("codigo", item.codigo)
        .eq("no_entrega", delivery.trim())
        .maybeSingle();
      resultados.push({ item, lote });
    }

    const semMatch = resultados.filter((r) => !r.lote);
    if (semMatch.length > 0) {
      setProcessando(false);
      setErro(
        `Delivery "${delivery.trim()}" não encontrada para o(s) código(s): ${semMatch.map((r) => r.item.codigo).join(", ")}. ` +
        `Peça pro Administrador atualizar a Base Peças com essa remessa antes de continuar.`
      );
      return false;
    }

    const { data: { user } } = await supabase.auth.getUser();
    for (const r of resultados) {
      await supabase
        .from("orcamento_itens")
        .update({
          no_entrega: delivery.trim(),
          custo_real: r.lote.valor_unitario,
          liberado: true,
          liberado_por: user.id,
          liberado_em: new Date().toISOString()
        })
        .eq("id", r.item.id);
    }
    const { error } = await supabase
      .from("orcamentos")
      .update({ no_entrega: delivery.trim(), status: statusDestino })
      .eq("id", id);

    setProcessando(false);
    if (error) { setErro("Falha ao registrar delivery: " + error.message); return false; }
    carregar();
    return true;
  }

  async function registrarFaturamento() {
    if (!valorPago || !dataPagamento) return;
    setProcessando(true);
    setErro("");

    let anexoPath = null;
    if (arquivoAnexo) {
      const nomeArquivo = `${id}/${Date.now()}-${arquivoAnexo.name}`;
      const { error: errUpload } = await supabase.storage.from("comprovantes").upload(nomeArquivo, arquivoAnexo);
      if (errUpload) {
        setProcessando(false);
        setErro("Falha ao subir o anexo: " + errUpload.message);
        return;
      }
      anexoPath = nomeArquivo;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({
        valor_pago: parseFloat(valorPago),
        data_pagamento: dataPagamento,
        anexo_pagamento_url: anexoPath,
        pagamento_validado_por: user.id,
        pagamento_validado_em: new Date().toISOString(),
        status: "Faturamento Efetuado"
      })
      .eq("id", id);

    setProcessando(false);
    if (error) { setErro("Falha ao registrar faturamento: " + error.message); return; }
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

  async function verComprovante() {
    if (!orcamento.anexo_pagamento_url) return;
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(orcamento.anexo_pagamento_url, 3600);
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
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
            {IconeAtual && <IconeAtual size={13} />}
            {orcamento.status}
          </span>
        </div>
        {orcamento.numero_pedido_compra && (
          <p className="text-xs text-muted mt-3">Nº do pedido de compra: <span className="font-mono">{orcamento.numero_pedido_compra}</span></p>
        )}
        {orcamento.no_entrega && (
          <p className="text-xs text-muted mt-1">Delivery: <span className="font-mono">{orcamento.no_entrega}</span></p>
        )}
        {orcamento.valor_pago && (
          <p className="text-xs text-muted mt-1">
            Pago: <span className="font-mono">{fmtBRL(orcamento.valor_pago)}</span> em {orcamento.data_pagamento && new Date(orcamento.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR")}
            {orcamento.anexo_pagamento_url && (
              <button onClick={verComprovante} className="ml-2 underline inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>
                Ver comprovante <ExternalLink size={11} />
              </button>
            )}
          </p>
        )}
        {orcamento.entregue && (
          <p className="text-xs mt-2 font-medium" style={{ color: "#2C7C6E" }}>
            ✓ Entregue em {new Date(orcamento.entregue_em).toLocaleDateString("pt-BR")}
          </p>
        )}
      </div>

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
              <th className="text-left px-4 py-2.5">Modelo</th>
              <th className="text-left px-4 py-2.5">Código</th>
              <th className="text-left px-4 py-2.5">Descrição</th>
              <th className="text-center px-4 py-2.5">Qtd</th>
              <th className="text-right px-4 py-2.5">Custo real</th>
              <th className="text-center px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const corCat = corCategoria(i.categoria);
              const Icone = iconeCategoria(i.categoria);
              return (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 font-mono font-medium">{i.modelo}</td>
                  <td className="px-4 py-2.5 font-mono" style={{ color: "var(--accent)" }}>
                    <span className="inline-flex items-center gap-1">
                      <Icone size={11} style={{ color: corCat.fg }} />
                      {i.codigo}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{i.descricao_resumida}</td>
                  <td className="px-4 py-2.5 text-center">{i.qtd}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(i.custo_real)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {i.liberado ? <Check size={16} style={{ color: "#2C7C6E" }} className="inline" /> : <AlertTriangle size={16} className="text-muted inline" />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- ações por etapa ---------- */}

      {orcamento.status === "Aguardando Separação/Compra" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div className="card p-5">
            <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
              <Package size={16} style={{ color: "var(--accent)" }} />
              Precisa comprar
            </p>
            <p className="text-xs text-muted mb-3">Informe o número do pedido de compra feito à Samsung.</p>
            <div className="flex gap-2">
              <input className="field-input" placeholder="Nº do pedido de compra" value={numeroPedidoCompra} onChange={(e) => setNumeroPedidoCompra(e.target.value)} />
              <button className="btn-primary shrink-0" disabled={processando || !numeroPedidoCompra.trim()} onClick={registrarCompra}>Registrar</button>
            </div>
          </div>
          <div className="card p-5">
            <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
              <PackageCheck size={16} style={{ color: "#2C7C6E" }} />
              Já tem em estoque
            </p>
            <p className="text-xs text-muted mb-3">Se já tiver a peça, informe a Delivery direto — pula pro faturamento.</p>
            <div className="flex gap-2">
              <input className="field-input" placeholder="Nº da Delivery" value={deliveryAdiantada} onChange={(e) => setDeliveryAdiantada(e.target.value)} />
              <button
                className="btn-primary shrink-0"
                disabled={processando || !deliveryAdiantada.trim()}
                onClick={() => processarDelivery(deliveryAdiantada, "Em Estoque - Aguardando Faturamento")}
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {orcamento.status === "Peças Compradas - Aguardando Chegada" && (
        <div className="card p-5 mb-4">
          <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
            <Truck size={16} style={{ color: "var(--accent)" }} />
            Peça chegou?
          </p>
          <p className="text-xs text-muted mb-3">Informe a Delivery pra confirmar o custo exato e liberar pro faturamento.</p>
          <div className="flex gap-2 max-w-md">
            <input className="field-input" placeholder="Nº da Delivery" value={deliveryChegada} onChange={(e) => setDeliveryChegada(e.target.value)} />
            <button
              className="btn-primary shrink-0"
              disabled={processando || !deliveryChegada.trim()}
              onClick={() => processarDelivery(deliveryChegada, "Em Estoque - Aguardando Faturamento")}
            >
              Registrar
            </button>
          </div>
        </div>
      )}

      {orcamento.status === "Em Estoque - Aguardando Faturamento" && (
        <div className="card p-5 mb-4">
          <p className="font-display font-semibold text-sm mb-1 flex items-center gap-2">
            <Receipt size={16} style={{ color: "var(--accent)" }} />
            Registrar faturamento
          </p>
          <p className="text-xs text-muted mb-4">Confirme o pagamento feito ao fornecedor pra liberar a próxima etapa.</p>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            <div>
              <label className="field-label">Valor pago</label>
              <input type="number" step="0.01" className="field-input" value={valorPago} onChange={(e) => setValorPago(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Data do pagamento</label>
              <input type="date" className="field-input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="field-label">Anexo (opcional)</label>
              <label className="flex items-center gap-2 border border-line rounded-[10px] px-3.5 py-2.5 cursor-pointer text-sm text-muted hover:border-brand-400">
                <Paperclip size={14} />
                {arquivoAnexo ? arquivoAnexo.name : "Escolher arquivo (comprovante de pagamento)"}
                <input type="file" className="hidden" onChange={(e) => setArquivoAnexo(e.target.files[0] || null)} />
              </label>
            </div>
          </div>
          <button className="btn-primary mt-4" disabled={processando || !valorPago || !dataPagamento} onClick={registrarFaturamento}>
            Registrar faturamento
          </button>
        </div>
      )}

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
        <div className="card p-5 mb-4 flex items-center justify-between">
          <div>
            <p className="font-display font-semibold text-sm">Pronto pra entrega</p>
            <p className="text-xs text-muted mt-0.5">Gere o romanéio e confirme a entrega ao cliente.</p>
          </div>
          <button className="btn-primary" onClick={abrirRomaneio}>
            <Send size={15} />
            Confirmar Entrega
          </button>
        </div>
      )}

      {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <Modal
        open={romaneioAberto}
        onClose={() => setRomaneioAberto(false)}
        title="Confirmar entrega"
        footer={
          <>
            <button className="btn-secondary" onClick={imprimirRomaneio}>Ver / Imprimir Romanéio</button>
            <button className="btn-primary" disabled={processando || selecionados.length === 0} onClick={confirmarEntregaFinal}>
              Confirmar Entrega ({selecionados.length})
            </button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">
          Este pedido e outros do mesmo cliente já liberados pra retirada podem ser entregues juntos, no mesmo romanéio.
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
