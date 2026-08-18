"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight } from "lucide-react";
import { getPerfilAtual, supabase } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { CORES_STATUS, ICONES_STATUS } from "../../lib/estoque";
import { getUnidadeAtiva } from "../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CORES_STATUS_FALLBACK = { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };

export default function OrcamentosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [numeroBusca, setNumeroBusca] = useState("");
  const [resultadoBusca, setResultadoBusca] = useState(undefined); // undefined = não buscou ainda
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      const unidadeAtiva = getUnidadeAtiva();
      let query = supabase
        .from("orcamentos")
        .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
        .order("criado_em", { ascending: false });
      // cliente vê tudo que é dele, independente de unidade; equipe só vê a unidade ativa
      if (p?.cargo !== "Cliente" && unidadeAtiva) {
        query = query.eq("unidade_id", unidadeAtiva.id);
      }
      const { data } = await query;
      setLista(data || []);
      setCarregando(false);
    })();
  }, []);

  async function buscarPorNumero(e) {
    e.preventDefault();
    const n = parseInt(numeroBusca, 10);
    if (!n) return;
    setBuscando(true);
    const unidadeAtiva = getUnidadeAtiva();
    let query = supabase
      .from("orcamentos")
      .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
      .eq("id", n);
    if (perfil?.cargo !== "Cliente" && unidadeAtiva) {
      query = query.eq("unidade_id", unidadeAtiva.id);
    }
    const { data } = await query.maybeSingle();
    setResultadoBusca(data || null);
    setBuscando(false);
  }

  const ehCliente = perfil?.cargo === "Cliente";

  return (
    <AppShell titulo="Orçamentos">
      <form onSubmit={buscarPorNumero} className="card p-4 mb-4">
        <p className="text-xs font-medium mb-2">Consultar orçamento pelo número</p>
        <div className="flex gap-2 max-w-sm">
          <input
            className="field-input"
            placeholder="Ex: 7"
            value={numeroBusca}
            onChange={(e) => setNumeroBusca(e.target.value)}
            inputMode="numeric"
          />
          <button className="btn-primary shrink-0" type="submit" disabled={buscando || !numeroBusca}>
            <Search size={15} />
            Buscar
          </button>
        </div>

        {resultadoBusca !== undefined && (
          <div className="mt-4">
            {resultadoBusca === null ? (
              <p className="text-sm text-danger">Nenhum orçamento encontrado com o número #{numeroBusca}.</p>
            ) : (() => {
              const cor = CORES_STATUS[resultadoBusca.status] || CORES_STATUS_FALLBACK;
              const IconeStatus = ICONES_STATUS[resultadoBusca.status];
              return (
                <button
                  onClick={() => router.push(`/orcamentos/${resultadoBusca.id}`)}
                  className="w-full flex items-center justify-between p-3.5 rounded-lg border border-line hover:bg-canvas text-left"
                >
                  <div>
                    <p className="text-sm font-semibold">Pedido #{resultadoBusca.id} — {resultadoBusca.clientes?.nome || "—"}</p>
                    <p className="text-xs text-muted mt-0.5">
                      Vendedor: {resultadoBusca.perfis?.nome || "—"} · {fmtBRL(resultadoBusca.valor_total)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
                      {IconeStatus && <IconeStatus size={11} />}
                      {resultadoBusca.entregue ? "Entregue" : resultadoBusca.status}
                    </span>
                    <ChevronRight size={16} className="text-muted" />
                  </div>
                </button>
              );
            })()}
          </div>
        )}
      </form>

      <p className="text-sm text-muted mb-3">{lista.length} orçamento(s)</p>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">
            {ehCliente ? "Você ainda não tem orçamentos." : "Nenhum orçamento pendente de revisão."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">#</th>
                {!ehCliente && <th className="text-left px-4 py-2.5">Cliente</th>}
                <th className="text-left px-4 py-2.5">Vendedor</th>
                <th className="text-left px-4 py-2.5">Data</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => {
                const cor = CORES_STATUS[o.status] || CORES_STATUS_FALLBACK;
                const IconeStatus = ICONES_STATUS[o.status];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                    onClick={() => router.push(`/orcamentos/${o.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted">#{o.id}</td>
                    {!ehCliente && (
                      <td className="px-4 py-2.5 font-medium">
                        {o.clientes?.nome || "—"}
                        {o.sem_pagamento && (
                          <span className="ml-2 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(214,51,108,0.14)", color: "#D6336C" }}>
                            SEM PAGAMENTO
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{new Date(o.criado_em).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(o.valor_total)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
                        {IconeStatus && <IconeStatus size={11} />}
                        {o.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
