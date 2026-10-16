"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Check, ArrowLeft, ChevronDown, RefreshCw, History, Hourglass, CheckCircle2 } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import SeloConfirmacao from "../../../components/SeloConfirmacao";
import { getUnidadeAtiva } from "../../../lib/unidade";
import { registrarAuditoria } from "../../../lib/auditoria";
import { inicioSemana, fimSemana, rotuloSemana } from "../../../lib/relatorios";

// Pagamento ao Fabricante (reformulado em 16/10/2026)
// - Só entram peças de pedidos VALIDADOS pelo gerente no Relatório Resumo.
// - A semana (domingo a sábado, igual ao Resumo) só aparece para pagar
//   quando TODOS os pedidos entregues nela foram validados ou não validados.
//   Pedido "não validado" fica de fora.
// - Semanas ainda com pedido pendente aparecem em "Aguardando validação".
// - "Validar semana inteira" abre o pop-up com a data do pagamento ao
//   fabricante e grava um selo (nome, login, data e hora) — histórico em
//   "Pagamentos confirmados".

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function infoSemana(dataStr) {
  const d = new Date(dataStr);
  const ini = inicioSemana(d);
  const fim = fimSemana(d);
  return {
    key: isoLocal(ini),
    w: rotuloSemana(d),
    periodo: `${ini.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`
  };
}
function hojeISO() {
  return isoLocal(new Date());
}

// O Supabase devolve no máximo 1000 linhas por consulta — busca em páginas.
async function buscarTodas(montarQuery) {
  const tamanho = 1000;
  let todas = [];
  for (let de = 0; ; de += tamanho) {
    const { data, error } = await montarQuery().range(de, de + tamanho - 1);
    if (error || !data) break;
    todas = todas.concat(data);
    if (data.length < tamanho) break;
  }
  return todas;
}

const MODOS = [
  { id: "semana", label: "Semana" },
  { id: "cliente", label: "Cliente" },
  { id: "data", label: "Data" }
];

export default function PagamentoFabricantePage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [login, setLogin] = useState("");
  const [itens, setItens] = useState([]);
  const [pendentesPorSemana, setPendentesPorSemana] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState("semana");
  const [abertos, setAbertos] = useState({});
  const [saindo, setSaindo] = useState([]);
  const [aviso, setAviso] = useState("");

  // pop-up de confirmação
  const [modalSemana, setModalSemana] = useState(null);
  const [dataPagamento, setDataPagamento] = useState(hojeISO());
  const [observacao, setObservacao] = useState("");
  const [erroModal, setErroModal] = useState("");
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      const { data: { user } } = await supabase.auth.getUser();
      setLogin((user?.email || "").split("@")[0]);
      if (["Administrador", "Financeiro"].includes(p?.cargo)) carregar();
    })();
  }, []);

  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true);
    const unidadeAtiva = getUnidadeAtiva();
    const uid = unidadeAtiva?.id || 0;
    const [dados, pendentes] = await Promise.all([
      buscarTodas(() =>
        supabase
          .from("orcamento_itens")
          .select("id, orcamento_id, codigo, descricao_resumida, qtd, custo_real, orcamentos!inner(id, numero_unidade, entregue, entregue_em, unidade_id, nota_fiscal_numero, validacao_gerente, clientes(nome))")
          .eq("liberado", true)
          .eq("custo_pago_fabricante", false)
          .eq("orcamentos.entregue", true)
          .eq("orcamentos.unidade_id", uid)
          .order("id")
      ),
      // pedidos entregues ainda sem decisão do gerente (travam a semana)
      buscarTodas(() =>
        supabase
          .from("orcamentos")
          .select("id, entregue_em")
          .eq("unidade_id", uid)
          .eq("entregue", true)
          .is("validacao_gerente", null)
          .order("id")
      )
    ]);
    const mapaPend = {};
    pendentes.forEach((o) => {
      if (!o.entregue_em) return;
      const s = infoSemana(o.entregue_em);
      mapaPend[s.key] = (mapaPend[s.key] || 0) + 1;
    });
    setPendentesPorSemana(mapaPend);
    setItens(dados);
    setCarregando(false);
  }

  // separa: prontos (pedido validado + semana fechada) x aguardando validação
  const { prontos, aguardando } = useMemo(() => {
    const prontos = [];
    const aguardandoMapa = new Map();
    for (const i of itens) {
      const o = i.orcamentos;
      if (!o?.entregue_em) continue;
      const s = infoSemana(o.entregue_em);
      const custoItem = Number(i.custo_real || 0) * Number(i.qtd || 0);
      const item = { ...i, custoItem, semana: s };
      if (o.validacao_gerente === "nao_validado") continue;
      if (o.validacao_gerente === "validado" && !pendentesPorSemana[s.key]) {
        prontos.push(item);
      } else {
        if (!aguardandoMapa.has(s.key)) aguardandoMapa.set(s.key, { ...s, itens: 0, custo: 0 });
        const g = aguardandoMapa.get(s.key);
        g.itens += 1;
        g.custo += custoItem;
      }
    }
    // semanas que só têm pendência (sem itens validados ainda) também aparecem
    Object.keys(pendentesPorSemana).forEach((key) => {
      if (!aguardandoMapa.has(key)) {
        const [a, m, d] = key.split("-").map(Number);
        const s = infoSemana(new Date(a, m - 1, d).toISOString());
        aguardandoMapa.set(key, { ...s, itens: 0, custo: 0 });
      }
    });
    const aguardando = [...aguardandoMapa.values()]
      .map((g) => ({ ...g, pendentes: pendentesPorSemana[g.key] || 0 }))
      .filter((g) => g.pendentes > 0)
      .sort((a, b) => b.key.localeCompare(a.key));
    return { prontos, aguardando };
  }, [itens, pendentesPorSemana]);

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const i of prontos) {
      const entregueEm = i.orcamentos.entregue_em;
      let key, label, w = null, periodo = null;
      if (modo === "semana") {
        key = i.semana.key; w = i.semana.w; periodo = i.semana.periodo; label = `Semana de ${periodo}`;
      } else if (modo === "cliente") {
        key = i.orcamentos?.clientes?.nome || "—"; label = key;
      } else {
        key = isoLocal(new Date(entregueEm)); label = new Date(entregueEm).toLocaleDateString("pt-BR");
      }
      if (!mapa.has(key)) mapa.set(key, { label, w, periodo, itens: [], custoTotal: 0, pedidos: new Set(), pecas: 0 });
      const g = mapa.get(key);
      g.itens.push(i);
      g.custoTotal += i.custoItem;
      g.pecas += Number(i.qtd || 0);
      g.pedidos.add(i.orcamento_id);
    }
    return Array.from(mapa.entries())
      .map(([key, v]) => ({ key, ...v, qtdPedidos: v.pedidos.size }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [prontos, modo]);

  function alternarGrupo(key) {
    setAbertos((a) => ({ ...a, [key]: !a[key] }));
  }

  function abrirConfirmacao(g) {
    setErroModal("");
    setObservacao("");
    setDataPagamento(hojeISO());
    setModalSemana(g);
  }

  async function confirmarPagamento() {
    const g = modalSemana;
    if (!g) return;
    if (!dataPagamento) { setErroModal("Informe a data do pagamento ao fabricante."); return; }
    setProcessando(true);
    setErroModal("");
    const unidadeAtiva = getUnidadeAtiva();
    const { data: idPagamento, error } = await supabase.rpc("confirmar_pagamento_fabricante", {
      p_unidade_id: unidadeAtiva?.id,
      p_semana_inicio: g.key,
      p_semana_rotulo: g.w,
      p_data_pagamento: dataPagamento,
      p_observacao: observacao.trim() || null,
      p_item_ids: g.itens.map((i) => i.id)
    });
    if (error) {
      setProcessando(false);
      setErroModal("Não foi possível confirmar: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "pagamento",
      entidade: "financeiro",
      entidadeId: idPagamento,
      descricao: `Pagamento ao fabricante confirmado — ${g.w} (${g.periodo}): ${fmtBRL(g.custoTotal)}, ${g.pecas} peça(s), ${g.qtdPedidos} pedido(s). Pago em ${new Date(dataPagamento + "T00:00:00").toLocaleDateString("pt-BR")}.`
    });
    setProcessando(false);
    setModalSemana(null);
    setSaindo((s) => [...s, g.key]);
    setAviso(`${g.w} confirmada. Veja o selo em "Pagamentos confirmados".`);
    setTimeout(async () => {
      await carregar(true);
      setSaindo((s) => s.filter((x) => x !== g.key));
    }, 900);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Pagamento ao Fabricante"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Pagamento ao Fabricante">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Pagamento ao Fabricante">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <button onClick={() => router.push("/financeiro")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Voltar para o Dashboard Financeiro
        </button>
        <div className="flex items-center gap-2">
          <button className="btn-secondary text-xs py-2" onClick={() => carregar()} disabled={carregando}>
            <RefreshCw size={13} className={carregando ? "animate-spin" : ""} />
            Atualizar
          </button>
          <button className="btn-primary text-xs py-2" onClick={() => router.push("/financeiro/fornecedor/confirmados")}>
            <History size={14} />
            Pagamentos confirmados
          </button>
        </div>
      </div>

      <p className="text-sm text-muted mb-3">
        Peças entregues de pedidos <b>validados pelo gerente</b> no Relatório Resumo, aguardando marcar que a Samsung foi paga.
        A semana só aparece aqui depois que todos os pedidos dela forem validados ou não validados.
      </p>

      {aviso && (
        <div className="card p-3 mb-3 text-sm flex items-center gap-2" style={{ outline: "2px solid #3FA796", outlineOffset: "-2px", color: "#2C7C6E" }}>
          <CheckCircle2 size={16} /> {aviso}
          <button className="ml-auto text-xs text-muted hover:text-ink" onClick={() => setAviso("")}>fechar</button>
        </div>
      )}

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted">Agrupar por:</span>
        {MODOS.map((m) => (
          <button key={m.id} onClick={() => setModo(m.id)} className={`chip ${modo === m.id ? "chip-active" : ""}`}>
            {m.label}
          </button>
        ))}
        {modo !== "semana" && <span className="text-[11px] text-muted ml-2">Para confirmar o pagamento, use a visão por <b>Semana</b>.</span>}
      </div>

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <>
          {grupos.length === 0 ? (
            <div className="card p-8 text-center mb-4">
              <p className="text-sm text-muted">Nenhuma semana liberada para pagamento ao fabricante.</p>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              {grupos.map((g) => {
                const aberto = !!abertos[g.key];
                return (
                  <div key={g.key} className={`card overflow-hidden ${saindo.includes(g.key) ? "linha-baixa-saindo" : ""}`}>
                    <div className="p-4 flex items-center justify-between flex-wrap gap-3">
                      <button onClick={() => alternarGrupo(g.key)} className="flex items-center gap-3 text-left">
                        <ChevronDown size={16} className="text-muted transition-transform" style={{ transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }} />
                        {g.w && (
                          <span className="font-mono font-black text-3xl leading-none px-3 py-2 rounded-xl" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                            {g.w}
                          </span>
                        )}
                        <div>
                          <p className="font-display font-semibold text-sm">{g.label}</p>
                          <p className="text-xs text-muted mt-0.5">
                            {g.qtdPedidos} pedido(s) · {g.pecas} peça(s) · Custo total: <b className="text-ink font-mono">{fmtBRL(g.custoTotal)}</b>
                          </p>
                        </div>
                      </button>
                      {modo === "semana" && (
                        <button className="btn-primary py-2 text-xs" onClick={() => abrirConfirmacao(g)}>
                          <Check size={14} />
                          Validar semana inteira
                        </button>
                      )}
                    </div>
                    {aberto && (
                      <div className="border-t border-line overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                              <th className="text-left px-4 py-2">Pedido</th>
                              <th className="text-left px-4 py-2">Nota Fiscal</th>
                              <th className="text-left px-4 py-2">Cliente</th>
                              <th className="text-left px-4 py-2">Código</th>
                              <th className="text-left px-4 py-2">Descrição</th>
                              <th className="text-center px-4 py-2">Qtd</th>
                              <th className="text-right px-4 py-2">Custo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.itens.map((i) => (
                              <tr key={i.id} className="border-b border-line last:border-0">
                                <td className="px-4 py-2 font-mono text-muted">#{i.orcamentos?.numero_unidade}</td>
                                <td className="px-4 py-2 font-mono font-semibold" style={{ color: i.orcamentos?.nota_fiscal_numero ? "var(--accent)" : undefined }}>{i.orcamentos?.nota_fiscal_numero || "—"}</td>
                                <td className="px-4 py-2">{i.orcamentos?.clientes?.nome || "—"}</td>
                                <td className="px-4 py-2 font-mono" style={{ color: "var(--accent)" }}>{i.codigo}</td>
                                <td className="px-4 py-2 text-muted max-w-[260px] truncate" title={i.descricao_resumida || ""}>{i.descricao_resumida || "—"}</td>
                                <td className="px-4 py-2 text-center">{i.qtd}</td>
                                <td className="px-4 py-2 text-right font-mono">{fmtBRL(i.custoItem)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {aguardando.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Hourglass size={13} /> Aguardando validação do gerente
              </p>
              <div className="space-y-2">
                {aguardando.map((g) => (
                  <div key={g.key} className="card p-3 flex items-center justify-between flex-wrap gap-3 opacity-80">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-black text-xl leading-none px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(232,163,61,0.16)", color: "#B5771C" }}>{g.w}</span>
                      <div>
                        <p className="text-sm font-medium">Semana de {g.periodo}</p>
                        <p className="text-xs text-muted">{g.pendentes} pedido(s) ainda sem validação do gerente</p>
                      </div>
                    </div>
                    <button className="btn-secondary text-xs py-1.5" onClick={() => router.push("/relatorios/resumo")}>Ir para o Resumo</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={!!modalSemana}
        onClose={() => !processando && setModalSemana(null)}
        title={modalSemana ? `Confirmar pagamento ao fabricante — ${modalSemana.w}` : ""}
      >
        {modalSemana && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg border border-line p-3"><p className="text-muted">Período</p><p className="font-medium">{modalSemana.periodo}</p></div>
              <div className="rounded-lg border border-line p-3"><p className="text-muted">Pedidos / peças</p><p className="font-medium">{modalSemana.qtdPedidos} / {modalSemana.pecas}</p></div>
              <div className="rounded-lg border border-line p-3"><p className="text-muted">Custo total</p><p className="font-mono font-semibold">{fmtBRL(modalSemana.custoTotal)}</p></div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Data do pagamento ao fabricante *</label>
                <input type="date" className="field-input" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Observação</label>
                <input className="field-input" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Opcional" />
              </div>
            </div>
            <div>
              <p className="text-xs text-muted mb-2">Assinatura eletrônica — será gravada assim:</p>
              <SeloConfirmacao nome={perfil?.nome} login={login} confirmadoEm={new Date().toISOString()} dataPagamento={dataPagamento} previa />
            </div>
            {erroModal && <p className="text-sm text-danger">{erroModal}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setModalSemana(null)} disabled={processando}>Cancelar</button>
              <button className="btn-primary" onClick={confirmarPagamento} disabled={processando}>
                <Check size={15} />
                {processando ? "Confirmando..." : "Confirmar pagamento"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
