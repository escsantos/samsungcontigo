"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, Pencil, Save, Trash2 } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { CORES_STATUS } from "../../../lib/estoque";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  useEffect(() => {
    carregar();
  }, [id]);

  async function carregar() {
    setPerfil(await getPerfilAtual());
    const { data: orc } = await supabase.from("orcamentos").select("*, clientes(nome, celular, email)").eq("id", id).single();
    setOrcamento(orc);
    const { data: its } = await supabase.from("orcamento_itens").select("*").eq("orcamento_id", id).order("id");
    setItens(its || []);
  }

  const totalAtual = itens.reduce((s, i) => s + Number(i.venda_total || 0), 0);

  function mudarQtdItem(itemId, valor) {
    const n = Math.max(1, parseInt(valor, 10) || 1);
    setItens((atual) =>
      atual.map((i) => (i.id === itemId ? { ...i, qtd: n, venda_total: Number(i.venda_unitario) * n } : i))
    );
  }

  function removerItem(itemId) {
    setItens((atual) => atual.filter((i) => i.id !== itemId));
  }

  async function salvarAjustes() {
    setProcessando(true);
    setErro("");
    for (const i of itens) {
      await supabase.from("orcamento_itens").update({ qtd: i.qtd, venda_total: i.venda_total }).eq("id", i.id);
    }
    const novoTotal = itens.reduce((s, i) => s + Number(i.venda_total || 0), 0);
    const { error } = await supabase.from("orcamentos").update({ valor_total: novoTotal }).eq("id", id);
    setProcessando(false);
    if (error) {
      setErro("Falha ao salvar ajustes: " + error.message);
      return;
    }
    setAjustando(false);
    carregar();
  }

  async function aprovar() {
    setProcessando(true);
    setErro("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("orcamentos")
      .update({ status: "Validado pelo Vendedor", revisado_por: user.id, revisado_em: new Date().toISOString() })
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
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full" style={{ background: cor.bg, color: cor.fg }}>
            {orcamento.status}
          </span>
        </div>
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

      <div className="card overflow-hidden mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
              <th className="text-left px-4 py-2.5">Modelo</th>
              <th className="text-left px-4 py-2.5">Categoria</th>
              <th className="text-left px-4 py-2.5">Código</th>
              <th className="text-left px-4 py-2.5">Descrição</th>
              <th className="text-center px-4 py-2.5">Qtd</th>
              <th className="text-right px-4 py-2.5">Total</th>
              {ajustando && <th></th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const corCat = corCategoria(i.categoria);
              const Icone = iconeCategoria(i.categoria);
              return (
                <tr key={i.id} className="border-b border-line last:border-0">
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
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(i.venda_total)}</td>
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

      <div className="card p-5 flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-muted">Total do orçamento</p>
          <p className="font-display font-bold text-2xl" style={{ color: "var(--accent)" }}>{fmtBRL(totalAtual)}</p>
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
                <button className="btn-primary" disabled={processando} onClick={aprovar}>
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
    </AppShell>
  );
}
