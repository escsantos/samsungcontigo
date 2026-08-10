"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, ArrowRight, Search, Check, AlertTriangle } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { ORDEM_STATUS, CORES_STATUS, ICONES_STATUS, proximoStatus, STATUS_EXIGE_ENTREGA_PARA_AVANCAR } from "../../../lib/estoque";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EstoquePedidoPage() {
  const { id } = useParams();
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [orcamento, setOrcamento] = useState(undefined);
  const [itens, setItens] = useState([]);
  const [entregas, setEntregas] = useState({});
  const [buscando, setBuscando] = useState({});
  const [erroItem, setErroItem] = useState({});
  const [confirmarAvancar, setConfirmarAvancar] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    setPerfil(await getPerfilAtual());
    const { data: orc } = await supabase.from("orcamentos").select("*, clientes(nome, celular, email)").eq("id", id).single();
    setOrcamento(orc);
    const { data: its } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", id).order("id");
    setItens(its || []);
    const iniciais = {};
    (its || []).forEach((i) => { iniciais[i.id] = i.no_entrega || ""; });
    setEntregas(iniciais);
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

  const emFluxoEstoque = ORDEM_STATUS.includes(orcamento.status);
  const cor = CORES_STATUS[orcamento.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
  const IconeStatusAtual = ICONES_STATUS[orcamento.status];
  const proximo = emFluxoEstoque ? proximoStatus(orcamento.status) : null;
  const exigeEntregaAgora = orcamento.status === STATUS_EXIGE_ENTREGA_PARA_AVANCAR;
  const todosLiberados = itens.length > 0 && itens.every((i) => i.liberado);

  async function buscarDelivery(item) {
    const valor = (entregas[item.id] || "").trim();
    if (!valor) return;
    setBuscando((b) => ({ ...b, [item.id]: true }));
    setErroItem((e) => ({ ...e, [item.id]: "" }));

    const { data: lote } = await supabase
      .from("lotes_pecas")
      .select("*")
      .eq("codigo", item.codigo)
      .eq("no_entrega", valor)
      .maybeSingle();

    if (!lote) {
      setBuscando((b) => ({ ...b, [item.id]: false }));
      setErroItem((e) => ({
        ...e,
        [item.id]: `Delivery "${valor}" não encontrada para o código ${item.codigo}. Peça pro Administrador atualizar a Base Peças com essa remessa.`
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

    setBuscando((b) => ({ ...b, [item.id]: false }));
    if (error) {
      setErroItem((e) => ({ ...e, [item.id]: "Falha ao salvar: " + error.message }));
      return;
    }
    setItens((atual) => atual.map((i) => (i.id === item.id ? { ...i, no_entrega: valor, custo_real: lote.valor_unitario, liberado: true } : i)));
  }

  async function avancarStatus() {
    if (!proximo) return;
    setProcessando(true);
    setErro("");
    const { error } = await supabase.from("orcamentos").update({ status: proximo }).eq("id", id);
    setProcessando(false);
    setConfirmarAvancar(false);
    if (error) {
      setErro("Falha ao avançar: " + error.message);
      return;
    }
    carregar();
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
            {IconeStatusAtual && <IconeStatusAtual size={13} />}
            {orcamento.status}
          </span>
        </div>
      </div>

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
              <th className="text-left px-4 py-2.5">Modelo</th>
              <th className="text-left px-4 py-2.5">Código</th>
              <th className="text-left px-4 py-2.5">Descrição</th>
              <th className="text-center px-4 py-2.5">Qtd</th>
              <th className="text-left px-4 py-2.5">Delivery</th>
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
                  <td className="px-4 py-2.5">
                    {i.liberado ? (
                      <span className="font-mono text-xs">{i.no_entrega}</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <input
                          className="field-input py-1.5 text-xs w-28"
                          placeholder="nº delivery"
                          value={entregas[i.id] || ""}
                          onChange={(e) => setEntregas((atual) => ({ ...atual, [i.id]: e.target.value }))}
                        />
                        <button
                          onClick={() => buscarDelivery(i)}
                          disabled={buscando[i.id] || !entregas[i.id]}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas shrink-0"
                        >
                          <Search size={13} />
                        </button>
                      </div>
                    )}
                    {erroItem[i.id] && (
                      <p className="text-[10.5px] text-danger mt-1 max-w-[220px] leading-snug">{erroItem[i.id]}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(i.custo_real)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {i.liberado ? (
                      <Check size={16} style={{ color: "#2C7C6E" }} className="inline" />
                    ) : (
                      <AlertTriangle size={16} className="text-muted inline" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {emFluxoEstoque && proximo && (
        <div className="card p-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-muted">Próxima etapa</p>
            <p className="font-display font-semibold">{proximo}</p>
            {exigeEntregaAgora && !todosLiberados && (
              <p className="text-xs text-danger mt-1">Informe a Delivery de todos os itens antes de avançar.</p>
            )}
          </div>
          <button
            className="btn-primary"
            disabled={exigeEntregaAgora && !todosLiberados}
            onClick={() => setConfirmarAvancar(true)}
          >
            Avançar para "{proximo}"
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {erro && <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <Modal
        open={confirmarAvancar}
        onClose={() => setConfirmarAvancar(false)}
        title="Avançar etapa?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarAvancar(false)}>Cancelar</button>
            <button className="btn-primary" disabled={processando} onClick={avancarStatus}>Confirmar</button>
          </>
        }
      >
        <p className="text-sm text-muted">O pedido #{orcamento.id} vai passar para "{proximo}".</p>
      </Modal>
    </AppShell>
  );
}
