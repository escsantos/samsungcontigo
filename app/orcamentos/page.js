"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, X, Hash, Contact, Wrench, Paperclip, FileText } from "lucide-react";
import { getPerfilAtual, supabase } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import Modal from "../../components/Modal";
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
  // Comprovantes anexados em cada pedido (16/10/2026)
  const [anexosPorPedido, setAnexosPorPedido] = useState({});
  const [anexosAbertos, setAnexosAbertos] = useState(null); // { pedido, anexos }
  const [erroAnexo, setErroAnexo] = useState("");
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
      // cliente (e JM3 Cliente, que também é preso a um único cliente) vê
      // tudo que é dele, independente de unidade; equipe só vê a unidade ativa
      if (!["Cliente", "JM3 Cliente"].includes(p?.cargo) && unidadeAtiva) {
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
      carregarAnexos(data || []);
    })();
  }, []);

  // Junta os comprovantes de cada pedido: anexo do próprio pagamento,
  // anexos extras (pagamento_anexos, tela do Estoque) e o anexo antigo do pedido.
  async function carregarAnexos(pedidos) {
    const ids = pedidos.map((o) => o.id);
    const mapa = {};
    const add = (pedidoId, item) => {
      const lista = mapa[pedidoId] || (mapa[pedidoId] = []);
      if (!lista.some((x) => x.caminho === item.caminho)) lista.push(item);
    };
    for (let k = 0; k < ids.length; k += 150) {
      const lote = ids.slice(k, k + 150);
      const { data: pags } = await supabase
        .from("pagamentos_orcamento")
        .select("id, orcamento_id, forma_pagamento, valor, anexo_url")
        .in("orcamento_id", lote);
      const pedidoDoPag = {};
      const infoPag = {};
      (pags || []).forEach((pg) => {
        pedidoDoPag[pg.id] = pg.orcamento_id;
        infoPag[pg.id] = `${pg.forma_pagamento} — ${fmtBRL(pg.valor)}`;
        if (pg.anexo_url) add(pg.orcamento_id, { caminho: pg.anexo_url, rotulo: infoPag[pg.id] });
      });
      const idsPag = Object.keys(pedidoDoPag);
      if (idsPag.length > 0) {
        const { data: extras } = await supabase.from("pagamento_anexos").select("pagamento_id, anexo_url").in("pagamento_id", idsPag);
        (extras || []).forEach((a) => {
          if (a.anexo_url && pedidoDoPag[a.pagamento_id]) add(pedidoDoPag[a.pagamento_id], { caminho: a.anexo_url, rotulo: infoPag[a.pagamento_id] });
        });
      }
    }
    pedidos.forEach((o) => {
      if (o.anexo_pagamento_url) add(o.id, { caminho: o.anexo_pagamento_url, rotulo: "Comprovante do pedido" });
    });
    setAnexosPorPedido(mapa);
  }

  async function abrirAnexo(caminho) {
    setErroAnexo("");
    const { data, error } = await supabase.storage.from("comprovantes").createSignedUrl(caminho, 3600);
    if (!error && data) window.open(data.signedUrl, "_blank");
    else setErroAnexo("Não foi possível abrir o anexo (sem permissão ou arquivo não encontrado).");
  }

  function clicarAnexo(e, o) {
    e.stopPropagation();
    const anexos = anexosPorPedido[o.id] || [];
    if (anexos.length === 1) abrirAnexo(anexos[0].caminho);
    else setAnexosAbertos({ pedido: o, anexos });
  }

  async function buscarPorNumero(e) {
    e.preventDefault();
    const n = parseInt(numeroBusca, 10);
    if (!n) return;
    setBuscando(true);
    const unidadeAtiva = getUnidadeAtiva();
    let query = supabase
      .from("orcamentos")
      .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)");
    if (!["Cliente", "JM3 Cliente"].includes(perfil?.cargo) && unidadeAtiva) {
      query = query.eq("numero_unidade", n).eq("unidade_id", unidadeAtiva.id);
    } else {
      query = query.eq("id", n);
    }
    const { data } = await query.maybeSingle();
    setResultadoBusca(data || null);
    setBuscando(false);
  }

  // JM3 Cliente tem nível de gerente (vê coluna Cliente/OS Interna, busca por
  // cliente etc.) — só o cargo "Cliente" (autoatendimento) tem essa UI reduzida.
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
                    <td className="px-4 py-2.5 font-mono text-muted whitespace-nowrap">
                      #{o.numero_unidade}
                      {(anexosPorPedido[o.id] || []).length > 0 && (
                        <button
                          type="button"
                          onClick={(e) => clicarAnexo(e, o)}
                          className="ml-1.5 inline-flex items-center justify-center gap-0.5 h-5 min-w-[20px] px-1 rounded-full align-middle hover:opacity-80"
                          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                          title={(anexosPorPedido[o.id] || []).length === 1 ? "Ver o comprovante anexado" : `${anexosPorPedido[o.id].length} comprovantes anexados`}
                        >
                          <Paperclip size={11} />
                          {(anexosPorPedido[o.id] || []).length > 1 && <span className="text-[9.5px] font-bold">{anexosPorPedido[o.id].length}</span>}
                        </button>
                      )}
                    </td>
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
      {erroAnexo && !anexosAbertos && (
        <p className="text-sm text-danger mt-3">{erroAnexo}</p>
      )}

      <Modal
        open={!!anexosAbertos}
        onClose={() => { setAnexosAbertos(null); setErroAnexo(""); }}
        title={anexosAbertos ? `Comprovantes do pedido #${anexosAbertos.pedido.numero_unidade}` : ""}
      >
        {anexosAbertos && (
          <div className="space-y-2">
            {anexosAbertos.anexos.map((a, idx) => (
              <div key={a.caminho} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
                <span className="text-muted">{idx + 1}. {a.rotulo}</span>
                <button type="button" className="btn-primary text-xs py-1.5 px-3 shrink-0" onClick={() => abrirAnexo(a.caminho)}>
                  <FileText size={13} /> Ver
                </button>
              </div>
            ))}
            {erroAnexo && <p className="text-sm text-danger">{erroAnexo}</p>}
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
