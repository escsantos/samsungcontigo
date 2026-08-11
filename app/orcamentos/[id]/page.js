"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, Pencil, Save, Trash2, Plus, Search, CheckCircle2 } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { corCategoria, iconeCategoria } from "../../../lib/categorias";
import { CORES_STATUS, ICONES_STATUS } from "../../../lib/estoque";
import { calcularPreco } from "../../../lib/precos";

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

  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termoBusca, setTermoBusca] = useState("");
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [qtdsBusca, setQtdsBusca] = useState({});
  const [pecasAdicionadasAgora, setPecasAdicionadasAgora] = useState([]);

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

    for (const i of itens) {
      if (i._novo) {
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
      } else {
        await supabase.from("orcamento_itens").update({ qtd: i.qtd, venda_total: i.venda_total }).eq("id", i.id);
      }
    }

    const idsAtuais = itens.filter((i) => !i._novo).map((i) => i.id);
    const { data: itensAntigos } = await supabase.from("orcamento_itens").select("id").eq("orcamento_id", id);
    const idsParaExcluir = (itensAntigos || []).map((i) => i.id).filter((oid) => !idsAtuais.includes(oid));
    if (idsParaExcluir.length > 0) {
      await supabase.from("orcamento_itens").delete().in("id", idsParaExcluir);
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
      .update({ status: "Aguardando Separação/Compra", revisado_por: user.id, revisado_em: new Date().toISOString() })
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
              <th className="text-right px-4 py-2.5">Total</th>
              {ajustando && <th></th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => {
              const corCat = corCategoria(i.categoria);
              const Icone = iconeCategoria(i.categoria);
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

      <Modal
        open={buscaAberta}
        onClose={fecharBusca}
        title="Adicionar peça ao pedido"
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
                      <td className="px-3 py-2 font-mono" style={{ color: "var(--accent)" }}>{p.codigo}</td>
                      <td className="px-3 py-2">{p.descricao_resumida}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">{p.modelo}</td>
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
