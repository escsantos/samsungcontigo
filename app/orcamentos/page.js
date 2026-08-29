"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, X, Hash, Contact, Wrench } from "lucide-react";
import { getPerfilAtual, supabase } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { CORES_STATUS, ICONES_STATUS, rotuloPagamentoPendente } from "../../lib/estoque";
import { getUnidadeAtiva } from "../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Ignora acento/caixa pra comparar "joao", "João" e "JOÃO" como iguais.
function normKey(s) {
  return String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

const CORES_STATUS_FALLBACK = { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };

export default function OrcamentosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [pagosPorPedido, setPagosPorPedido] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [numeroBusca, setNumeroBusca] = useState("");
  const [resultadoBusca, setResultadoBusca] = useState(undefined); // undefined = não buscou ainda
  const [buscando, setBuscando] = useState(false);
  const [buscaCliente, setBuscaCliente] = useState("");
  const [sugestoesAbertas, setSugestoesAbertas] = useState(false);
  const [buscaOS, setBuscaOS] = useState("");

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      const unidadeAtiva = getUnidadeAtiva();
      let query = supabase
        .from("orcamentos")
        .select("*, clientes(nome, nome_fantasia), perfis!orcamentos_vendedor_id_fkey(nome)")
        .order("criado_em", { ascending: false });
      // cliente vê tudo que é dele, independente de unidade; equipe só vê a unidade ativa
      if (p?.cargo !== "Cliente" && unidadeAtiva) {
        query = query.eq("unidade_id", unidadeAtiva.id);
      }
      const { data } = await query;
      setLista(data || []);

      const idsPedidos = (data || []).filter((o) => o.sem_pagamento).map((o) => o.id);
      if (idsPedidos.length > 0) {
        const { data: pagamentos } = await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsPedidos);
        const soma = {};
        (pagamentos || []).forEach((pg) => { soma[pg.orcamento_id] = (soma[pg.orcamento_id] || 0) + Number(pg.valor || 0); });
        (data || []).forEach((o) => { soma[o.id] = (soma[o.id] || 0) + Number(o.valor_herdado_pai || 0); });
        setPagosPorPedido(soma);
      }
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
      .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)");
    if (perfil?.cargo !== "Cliente" && unidadeAtiva) {
      query = query.eq("numero_unidade", n).eq("unidade_id", unidadeAtiva.id);
    } else {
      query = query.eq("id", n);
    }
    const { data } = await query.maybeSingle();
    setResultadoBusca(data || null);
    setBuscando(false);
  }

  const ehCliente = perfil?.cargo === "Cliente";

  const termoClienteNorm = normKey(buscaCliente);
  const termoOSNorm = normKey(buscaOS);
  const listaFiltrada = useMemo(() => {
    return lista.filter((o) => {
      if (termoClienteNorm) {
        const nome = normKey(o.clientes?.nome);
        const fantasia = normKey(o.clientes?.nome_fantasia);
        if (!nome.includes(termoClienteNorm) && !fantasia.includes(termoClienteNorm)) return false;
      }
      if (termoOSNorm && !normKey(o.os_interna).includes(termoOSNorm)) return false;
      return true;
    });
  }, [lista, termoClienteNorm, termoOSNorm]);
  const sugestoesCliente = termoClienteNorm ? listaFiltrada.slice(0, 8) : [];

  return (
    <AppShell titulo="Orçamentos">
      <form onSubmit={buscarPorNumero} className="card p-4 mb-4">
        <p className="text-xs font-medium mb-2">Consultar orçamento</p>
        <div className="flex gap-2 flex-wrap items-stretch">
          <div className="relative w-32 shrink-0">
            <Hash size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <input
              className="field-input pl-8"
              placeholder="Nº pedido"
              value={numeroBusca}
              onChange={(e) => setNumeroBusca(e.target.value)}
              inputMode="numeric"
            />
          </div>
          <button className="btn-primary shrink-0" type="submit" disabled={buscando || !numeroBusca}>
            <Search size={15} />
            Buscar
          </button>

          {!ehCliente && (
            <div className="relative flex-1 min-w-[200px]">
              <Contact size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                className="field-input pl-8 pr-8"
                placeholder="Cliente ou empresa"
                value={buscaCliente}
                onChange={(e) => setBuscaCliente(e.target.value)}
                onFocus={() => setSugestoesAbertas(true)}
                onBlur={() => setTimeout(() => setSugestoesAbertas(false), 150)}
              />
              {buscaCliente && (
                <button
                  type="button"
                  onClick={() => setBuscaCliente("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  aria-label="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}

              {sugestoesAbertas && termoClienteNorm && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1.5 card p-1.5 max-h-72 overflow-auto shadow-lg">
                  {sugestoesCliente.length === 0 ? (
                    <p className="text-sm text-muted px-2.5 py-2">Nenhum orçamento encontrado para &quot;{buscaCliente}&quot;.</p>
                  ) : (
                    sugestoesCliente.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          router.push(`/orcamentos/${o.id}`);
                          setBuscaCliente("");
                          setSugestoesAbertas(false);
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-canvas text-sm flex items-center justify-between gap-2"
                      >
                        <span className="truncate">
                          <span className="font-mono text-muted">#{o.numero_unidade}</span>{" "}
                          <span className="font-medium">{o.clientes?.nome || "—"}</span>
                          {o.clientes?.nome_fantasia && <span className="text-muted text-xs"> ({o.clientes.nome_fantasia})</span>}
                        </span>
                        <ChevronRight size={14} className="text-muted shrink-0" />
                      </button>
                    ))
                  )}
                  {listaFiltrada.length > sugestoesCliente.length && (
                    <p className="text-[11px] text-muted px-2.5 py-1.5 border-t border-line mt-1">
                      +{listaFiltrada.length - sugestoesCliente.length} outro(s) resultado(s) — veja a lista completa abaixo.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!ehCliente && (
            <div className="relative flex-1 min-w-[160px]">
              <Wrench size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                className="field-input pl-8 pr-8"
                placeholder="OS Interna"
                value={buscaOS}
                onChange={(e) => setBuscaOS(e.target.value)}
              />
              {buscaOS && (
                <button
                  type="button"
                  onClick={() => setBuscaOS("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                  aria-label="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
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
                    <p className="text-sm font-semibold">Pedido #{resultadoBusca.numero_unidade} — {resultadoBusca.clientes?.nome || "—"}</p>
                    <p className="text-xs text-muted mt-0.5">
                      Vendedor: {resultadoBusca.perfis?.nome || "—"} · {fmtBRL(resultadoBusca.valor_total)}
                      {resultadoBusca.os_interna && <> · OS: <span className="font-mono">{resultadoBusca.os_interna}</span></>}
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

      <p className="text-sm text-muted mb-3">
        {listaFiltrada.length} orçamento(s)
        {termoClienteNorm ? ` — cliente/empresa "${buscaCliente}"` : ""}
        {termoOSNorm ? ` — OS Interna "${buscaOS}"` : ""}
      </p>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">
            {termoClienteNorm || termoOSNorm
              ? "Nenhum orçamento encontrado pra esses filtros."
              : ehCliente
              ? "Você ainda não tem orçamentos."
              : "Nenhum orçamento pendente de revisão."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">#</th>
                {!ehCliente && <th className="text-left px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><Contact size={11} />Cliente</span></th>}
                <th className="text-left px-4 py-2.5">Vendedor</th>
                {!ehCliente && <th className="text-left px-4 py-2.5"><span className="inline-flex items-center gap-1.5"><Wrench size={11} />OS Interna</span></th>}
                <th className="text-left px-4 py-2.5">Data</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((o) => {
                const cor = CORES_STATUS[o.status] || CORES_STATUS_FALLBACK;
                const IconeStatus = ICONES_STATUS[o.status];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                    onClick={() => router.push(`/orcamentos/${o.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted">#{o.numero_unidade}</td>
                    {!ehCliente && (
                      <td className="px-4 py-2.5 font-medium">
                        {o.clientes?.nome || "—"}
                        {o.clientes?.nome_fantasia && (
                          <span className="text-muted text-xs font-normal"> ({o.clientes.nome_fantasia})</span>
                        )}
                        {o.sem_pagamento && (() => {
                          const r = rotuloPagamentoPendente(pagosPorPedido[o.id] || 0);
                          return (
                            <span className="ml-2 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: r.bg, color: r.fg }}>
                              {r.texto}
                            </span>
                          );
                        })()}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                    {!ehCliente && <td className="px-4 py-2.5 font-mono text-muted">{o.os_interna || "—"}</td>}
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
