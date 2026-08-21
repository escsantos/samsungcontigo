"use client";
import { useEffect, useState } from "react";
import { ShieldAlert, Check, RotateCcw, Building2, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { getUnidadeAtiva } from "../../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function EstornosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("pendentes");

  const [processandoModal, setProcessandoModal] = useState(null);
  const [observacao, setObservacao] = useState("");
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (["Administrador", "Financeiro"].includes(p?.cargo)) carregar();
    })();
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("estornos")
      .select("*, orcamentos(numero_unidade, clientes(nome)), solicitante:perfis!estornos_solicitado_por_fkey(nome), processador:perfis!estornos_processado_por_fkey(nome)")
      .order("solicitado_em", { ascending: false });
    const unidadeAtiva = getUnidadeAtiva();
    setLista(unidadeAtiva ? (data || []).filter((e) => !e.unidade_id || e.unidade_id === unidadeAtiva.id) : data || []);
    setCarregando(false);
  }

  async function confirmarEstorno() {
    if (!processandoModal) return;
    setProcessando(true);
    setErro("");
    const { error } = await supabase.rpc("concluir_estorno", { p_estorno_id: processandoModal.id, p_observacao: observacao.trim() || null });
    setProcessando(false);
    if (error) {
      setErro("Falha ao concluir estorno: " + error.message);
      return;
    }
    setProcessandoModal(null);
    setObservacao("");
    carregar();
  }

  if (perfil === undefined) {
    return <AppShell titulo="Estornos"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Estornos">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  const filtrados = lista.filter((e) => (aba === "pendentes" ? e.status === "Pendente" : e.status === "Concluído"));
  const totalPendente = lista.filter((e) => e.status === "Pendente").reduce((s, e) => s + Number(e.valor), 0);

  return (
    <AppShell titulo="Estornos">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="card p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(225,97,79,0.14)", color: "#E1614F" }}>
            <RotateCcw size={17} />
          </div>
          <p className="text-xs text-muted mb-0.5">Aguardando processar</p>
          <p className="font-mono font-bold text-2xl">{fmtBRL(totalPendente)}</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(232,163,61,0.14)", color: "#C2801F" }}>
            <RotateCcw size={17} />
          </div>
          <p className="text-xs text-muted mb-0.5">Solicitações pendentes</p>
          <p className="font-mono font-bold text-2xl">{lista.filter((e) => e.status === "Pendente").length}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setAba("pendentes")} className={`chip ${aba === "pendentes" ? "chip-active" : ""}`}>Pendentes</button>
        <button onClick={() => setAba("concluidos")} className={`chip ${aba === "concluidos" ? "chip-active" : ""}`}>Concluídos</button>
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum estorno {aba === "pendentes" ? "pendente" : "concluído"}.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Pedido</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Motivo</th>
                <th className="text-right px-4 py-2.5">Valor</th>
                <th className="text-left px-4 py-2.5">Solicitado por</th>
                <th className="text-left px-4 py-2.5">Data</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((e) => (
                <tr key={e.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-2.5">
                    <button onClick={() => router.push(`/estoque/${e.orcamento_id}`)} className="font-mono flex items-center gap-1 hover:underline" style={{ color: "var(--accent)" }}>
                      #{e.orcamentos?.numero_unidade}
                      <ExternalLink size={11} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">{e.orcamentos?.clientes?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-muted max-w-[220px] truncate" title={e.motivo}>{e.motivo || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(e.valor)}</td>
                  <td className="px-4 py-2.5 text-muted">{e.solicitante?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">{fmtDataHora(e.status === "Pendente" ? e.solicitado_em : e.processado_em)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {e.status === "Pendente" ? (
                      <button
                        className="btn-primary text-xs py-1.5 px-3"
                        onClick={() => { setProcessandoModal(e); setObservacao(""); setErro(""); }}
                      >
                        <Check size={13} />
                        Confirmar estorno
                      </button>
                    ) : (
                      <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
                        Concluído por {e.processador?.nome || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!processandoModal}
        onClose={() => setProcessandoModal(null)}
        title="Confirmar estorno"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setProcessandoModal(null)}>Cancelar</button>
            <button className="btn-primary" disabled={processando} onClick={confirmarEstorno}>
              {processando ? "Processando..." : "Confirmar baixa do estorno"}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted mb-3">
          Confirma que <b>{fmtBRL(processandoModal?.valor)}</b> do pedido #{processandoModal?.orcamentos?.numero_unidade} foi devolvido ao cliente?
          Isso lança a baixa desse valor no sistema.
        </p>
        <label className="field-label">Observação (opcional)</label>
        <textarea className="field-input" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex: devolvido via PIX em 20/08" />
        {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      </Modal>
    </AppShell>
  );
}
