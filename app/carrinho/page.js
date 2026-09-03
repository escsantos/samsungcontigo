"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, ShoppingCart } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
import { useCarrinho } from "../../contexts/CarrinhoContext";
import { calcularPreco } from "../../lib/precos";
import { corCategoria, iconeCategoria } from "../../lib/categorias";
import { getUnidadeAtiva } from "../../lib/unidade";
import { registrarAuditoria } from "../../lib/auditoria";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CarrinhoPage() {
  const router = useRouter();
  const carrinho = useCarrinho();
  const [perfil, setPerfil] = useState(undefined);
  const [margem, setMargem] = useState(30);
  const [impostoTotal, setImpostoTotal] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      const unidadeAtiva = getUnidadeAtiva();
      const { data: impostos } = await supabase.from("impostos").select("percentual, ativo").eq("unidade_id", unidadeAtiva?.id);
      const soma = (impostos || []).filter((i) => i.ativo).reduce((s, i) => s + Number(i.percentual), 0);
      setImpostoTotal(soma);
    })();
  }, []);

  const margemEfetiva = perfil?.cargo === "Cliente" ? 30 : margem;
  const mostraCusto = perfil?.cargo !== "Cliente";

  const itensCalculados = useMemo(() => {
    return (carrinho?.itens || []).map((i) => {
      const { venda, imposto, lucroLiquido } = calcularPreco(i.custoUnitario, margemEfetiva, impostoTotal);
      return {
        ...i,
        vendaUnit: venda,
        custoTotal: i.custoUnitario !== null ? i.custoUnitario * i.qtd : null,
        vendaTotal: venda !== null ? venda * i.qtd : null
      };
    });
  }, [carrinho?.itens, margemEfetiva, impostoTotal]);

  const totalGeral = itensCalculados.reduce((s, i) => s + (i.vendaTotal || 0), 0);

  async function confirmarPedido() {
    setErro("");
    if (!carrinho.clienteId || itensCalculados.length === 0) return;
    setEnviando(true);

    const { data: cliente } = await supabase.from("clientes").select("vendedor_id").eq("id", carrinho.clienteId).single();
    const { data: { user } } = await supabase.auth.getUser();
    const unidadeAtiva = getUnidadeAtiva();
    if (!unidadeAtiva) {
      setEnviando(false);
      setErro("Não identifiquei a unidade ativa. Recarregue a página e tente de novo.");
      return;
    }

    const { data: numeroReservado, error: errNumero } = await supabase.rpc("proximo_numero_pedido", { p_unidade_id: unidadeAtiva.id });
    if (errNumero) {
      setEnviando(false);
      setErro("Falha ao gerar o número do pedido: " + errNumero.message);
      return;
    }

    const { data: orcamento, error: errOrc } = await supabase
      .from("orcamentos")
      .insert({
        cliente_id: carrinho.clienteId,
        vendedor_id: cliente?.vendedor_id || null,
        criado_por: user.id,
        status: "Pendente de Análise",
        valor_total: totalGeral,
        margem: margemEfetiva,
        imposto_total: impostoTotal,
        unidade_id: unidadeAtiva.id,
        numero_unidade: numeroReservado
      })
      .select()
      .single();

    if (errOrc) {
      setEnviando(false);
      setErro("Não consegui enviar o pedido: " + errOrc.message);
      return;
    }

    const itensParaInserir = itensCalculados.map((i) => ({
      orcamento_id: orcamento.id,
      // peças "Não Classificado" (só existem em lotes_pecas, sem entrada no
      // catálogo GSPN) chegam com um id sintético negativo — não é um id
      // real de pecas_catalogo, então não pode ir na FK peca_id.
      peca_id: i.pecaId > 0 ? i.pecaId : null,
      modelo: i.modelo,
      categoria: i.categoria,
      codigo: i.codigo,
      descricao_resumida: i.descricaoResumida,
      descricao_peca: i.descricaoPeca,
      qtd: i.qtd,
      custo_unitario: i.custoUnitario,
      venda_unitario: i.vendaUnit,
      venda_total: i.vendaTotal
    }));

    const { error: errItens } = await supabase.from("orcamento_itens").insert(itensParaInserir);
    setEnviando(false);
    if (errItens) {
      setErro("Pedido criado, mas houve falha ao salvar os itens: " + errItens.message);
      return;
    }

    await registrarAuditoria({
      tipoEvento: "criacao",
      entidade: "orcamentos",
      entidadeId: orcamento.id,
      descricao: `Orçamento #${orcamento.numero_unidade} criado (${fmtBRL(totalGeral)}).`
    });

    carrinho.limparCarrinho();
    setSucesso(true);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Carrinho"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  return (
    <AppShell titulo="Carrinho">
      {!carrinho?.clienteId || itensCalculados.length === 0 ? (
        <div className="card p-12 text-center">
          <ShoppingCart size={32} className="mx-auto mb-3 text-muted" />
          <p className="font-display font-semibold mb-1">Seu carrinho está vazio</p>
          <p className="text-sm text-muted mb-5">
            {perfil?.cargo === "Cliente"
              ? "Vá até a Consulta de Peças e adicione itens ao carrinho."
              : "Selecione um cliente na Consulta de Peças e adicione peças ao carrinho."}
          </p>
          <button className="btn-primary" onClick={() => router.push("/pecas")}>Ir para Consulta de Peças</button>
        </div>
      ) : (
        <>
          <div className="card p-4 mb-4 flex items-center justify-between">
            <p className="text-sm">Orçamento para: <b>{carrinho.clienteNome}</b></p>
            <button className="text-xs text-danger flex items-center gap-1.5 hover:opacity-80" onClick={carrinho.limparCarrinho}>
              <Trash2 size={13} />
              Limpar carrinho
            </button>
          </div>

          <div className="card overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-4 py-2.5">Modelo</th>
                  <th className="text-left px-4 py-2.5">Categoria</th>
                  <th className="text-left px-4 py-2.5">Código</th>
                  <th className="text-left px-4 py-2.5">Descrição</th>
                  <th className="text-center px-4 py-2.5">Qtd</th>
                  <th className="text-right px-4 py-2.5">{mostraCusto ? "Venda Sugerida" : "Valor de Venda"}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {itensCalculados.map((i) => {
                  const cor = corCategoria(i.categoria);
                  const Icone = iconeCategoria(i.categoria);
                  return (
                    <tr key={i.pecaId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-mono font-medium">{i.modelo}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: cor.bg, color: cor.fg }}>
                          <Icone size={11} />
                          {i.categoria}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono" style={{ color: "var(--accent)" }}>{i.codigo}</td>
                      <td className="px-4 py-2.5">{i.descricaoResumida}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="number"
                          min={1}
                          className="field-input py-1 px-1.5 text-center font-mono w-14 mx-auto"
                          value={i.qtd}
                          onChange={(e) => carrinho.mudarQtd(i.pecaId, e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtBRL(i.vendaTotal)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => carrinho.removerItem(i.pecaId)} className="text-muted hover:text-danger">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">Total do pedido</p>
              <p className="font-display font-bold text-2xl" style={{ color: "var(--accent)" }}>{fmtBRL(totalGeral)}</p>
            </div>
            <button className="btn-primary" disabled={enviando} onClick={confirmarPedido}>
              {enviando ? "Enviando..." : "Confirmar pedido"}
            </button>
          </div>

          {erro && <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
        </>
      )}

      <Modal
        open={sucesso}
        onClose={() => router.push("/orcamentos")}
        title="Pedido enviado!"
        footer={<button className="btn-primary" onClick={() => router.push("/orcamentos")}>Ver meus orçamentos</button>}
      >
        <p className="text-sm text-muted">Seu pedido foi enviado para o vendedor revisar. Você pode acompanhar o status na tela de Orçamentos.</p>
      </Modal>
    </AppShell>
  );
}
