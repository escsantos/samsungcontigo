"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, FileCheck2, Clock, AlertTriangle, Percent, Download, ExternalLink, Building2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { getUnidadeAtiva } from "../../lib/unidade";
import { PERIODOS, calcularIntervalo } from "../../lib/periodo";
import { STATUS_POS_LIBERACAO, faltaEmitirNF, CARGOS_FISCAL } from "../../lib/fiscal";

const CARGOS_PERMITIDOS = CARGOS_FISCAL;

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}
function noPeriodo(dataStr, intervalo) {
  if (!intervalo) return true;
  if (!dataStr) return false;
  const t = new Date(dataStr).getTime();
  return t >= intervalo.de.getTime() && t <= intervalo.ate.getTime();
}

export default function FiscalPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);
  const [unidadeInfo, setUnidadeInfo] = useState(null);
  const [lista, setLista] = useState([]);
  const [aba, setAba] = useState("pendentes");
  const [periodo, setPeriodo] = useState("mes");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  const intervalo = useMemo(() => calcularIntervalo(periodo, dataDe, dataAte), [periodo, dataDe, dataAte]);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (CARGOS_PERMITIDOS.includes(p?.cargo)) carregar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregar() {
    setCarregando(true);
    const unidadeAtiva = getUnidadeAtiva();

    // busca a unidade direto do banco (não confia no cache local) pra saber
    // se ela é obrigada a emitir Nota Fiscal.
    if (unidadeAtiva) {
      const { data: u } = await supabase.from("unidades").select("id, nome, obriga_nota_fiscal").eq("id", unidadeAtiva.id).single();
      setUnidadeInfo(u || null);
    } else {
      setUnidadeInfo(null);
    }

    let query = supabase
      .from("orcamentos")
      .select("id, numero_unidade, status, entregue, valor_total, criado_em, separado_em, nota_fiscal_numero, nota_fiscal_emitida_em, nota_fiscal_emitir_depois, nota_fiscal_observacao, clientes(nome), emissor:perfis!orcamentos_nota_fiscal_emitida_por_fkey(nome)")
      .neq("status", "Cancelado")
      .order("criado_em", { ascending: false });
    if (unidadeAtiva) query = query.eq("unidade_id", unidadeAtiva.id);
    const { data } = await query;
    setLista(data || []);

    setCarregando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Fiscal"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !CARGOS_PERMITIDOS.includes(perfil.cargo)) {
    return (
      <AppShell titulo="Fiscal">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente, Supervisor, Estoque, Financeiro e Vendedor acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  function irParaPedido(o) {
    router.push(perfil.cargo === "Vendedor" ? `/orcamentos/${o.id}` : `/estoque/${o.id}`);
  }

  const obrigaNF = unidadeInfo?.obriga_nota_fiscal !== false;

  const liberados = lista.filter((o) => STATUS_POS_LIBERACAO.includes(o.status));
  const pendentes = lista.filter((o) => faltaEmitirNF(o, obrigaNF));
  const marcadasDepois = pendentes.filter((o) => o.nota_fiscal_emitir_depois);
  const emitidas = lista.filter((o) => o.nota_fiscal_numero);
  const emitidasPeriodo = emitidas.filter((o) => noPeriodo(o.nota_fiscal_emitida_em, intervalo));
  const liberadosComNF = liberados.filter((o) => o.nota_fiscal_numero).length;
  const percentualEmitido = liberados.length > 0 ? (liberadosComNF / liberados.length) * 100 : 100;

  function exportarExcel() {
    const base = aba === "pendentes" ? pendentes : emitidasPeriodo;
    const linhas = base.map((o) => ({
      Pedido: o.numero_unidade,
      Cliente: o.clientes?.nome || "",
      Status: o.entregue ? "Entregue" : o.status,
      "Valor (R$)": Number(o.valor_total || 0).toFixed(2),
      ...(aba === "pendentes"
        ? {
            "Liberado em": o.separado_em ? new Date(o.separado_em).toLocaleDateString("pt-BR") : "",
            "Marcado p/ depois": o.nota_fiscal_emitir_depois ? "Sim" : "Não",
            "Motivo": o.nota_fiscal_observacao || ""
          }
        : {
            "Nº Nota Fiscal": o.nota_fiscal_numero || "",
            "Emitida em": o.nota_fiscal_emitida_em ? new Date(o.nota_fiscal_emitida_em).toLocaleString("pt-BR") : "",
            "Emitida por": o.emissor?.nome || ""
          })
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, aba === "pendentes" ? "NF Pendentes" : "NF Emitidas");
    XLSX.writeFile(wb, `fiscal-${aba}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <AppShell titulo="Fiscal">
      {!unidadeInfo ? null : !obrigaNF && (
        <div className="mb-4 rounded-lg px-3 py-2.5 text-sm flex items-center gap-2" style={{ background: "rgba(139,147,161,0.14)", color: "#5D6572" }}>
          <Building2 size={15} className="shrink-0" />
          A unidade <b>{unidadeInfo.nome}</b> não é obrigada a emitir Nota Fiscal — o controle de pendências abaixo não se aplica a ela. Você ainda pode registrar o número da NF nos pedidos, se emitir.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
        <div className="card p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
            <FileCheck2 size={17} />
          </div>
          <p className="text-xs text-muted mb-0.5">NFs emitidas no período</p>
          <p className="font-mono font-bold text-2xl">{emitidasPeriodo.length}</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: obrigaNF && pendentes.length > 0 ? "var(--danger-soft)" : "rgba(139,147,161,0.14)", color: obrigaNF && pendentes.length > 0 ? "var(--danger)" : "#5D6572" }}>
            <AlertTriangle size={17} />
          </div>
          <p className="text-xs text-muted mb-0.5">Pedidos liberados sem NF</p>
          <p className="font-mono font-bold text-2xl" style={{ color: obrigaNF && pendentes.length > 0 ? "var(--danger)" : undefined }}>{obrigaNF ? pendentes.length : "—"}</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(232,163,61,0.14)", color: "#C2801F" }}>
            <Clock size={17} />
          </div>
          <p className="text-xs text-muted mb-0.5">Marcadas "emitir depois"</p>
          <p className="font-mono font-bold text-2xl">{obrigaNF ? marcadasDepois.length : "—"}</p>
        </div>
        <div className="card p-5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(67,56,202,0.14)", color: "#4338CA" }}>
            <Percent size={17} />
          </div>
          <p className="text-xs text-muted mb-0.5">Liberados com NF emitida</p>
          <p className="font-mono font-bold text-2xl">{obrigaNF ? percentualEmitido.toFixed(0) + "%" : "—"}</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex gap-2">
          <button onClick={() => setAba("pendentes")} className={`chip ${aba === "pendentes" ? "chip-active" : ""}`}>
            Pendentes {obrigaNF && pendentes.length > 0 ? `(${pendentes.length})` : ""}
          </button>
          <button onClick={() => setAba("emitidas")} className={`chip ${aba === "emitidas" ? "chip-active" : ""}`}>
            Emitidas
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {aba === "emitidas" && (
            <>
              {PERIODOS.map((p) => (
                <button key={p.id} onClick={() => setPeriodo(p.id)} className={`chip ${periodo === p.id ? "chip-active" : ""}`}>
                  {p.label}
                </button>
              ))}
              {periodo === "personalizado" && (
                <div className="flex items-center gap-2">
                  <input type="date" className="field-input py-1.5 text-xs" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
                  <span className="text-xs text-muted">até</span>
                  <input type="date" className="field-input py-1.5 text-xs" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
                </div>
              )}
            </>
          )}
          <button className="btn-secondary text-xs py-2" onClick={exportarExcel}>
            <Download size={14} />
            Exportar Excel
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : aba === "pendentes" ? (
          !obrigaNF ? (
            <p className="text-sm text-muted p-6 text-center">Essa unidade não exige controle de Nota Fiscal.</p>
          ) : pendentes.length === 0 ? (
            <p className="text-sm text-muted p-6 text-center">Nenhum pedido liberado com NF pendente. 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-4 py-2.5">Pedido</th>
                  <th className="text-left px-4 py-2.5">Cliente</th>
                  <th className="text-left px-4 py-2.5">Liberado em</th>
                  <th className="text-right px-4 py-2.5">Valor</th>
                  <th className="text-left px-4 py-2.5">Situação</th>
                  <th className="text-right px-4 py-2.5">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((o) => (
                  <tr key={o.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => irParaPedido(o)}>
                    <td className="px-4 py-2.5 font-mono">#{o.numero_unidade}</td>
                    <td className="px-4 py-2.5">{o.clientes?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{o.separado_em ? new Date(o.separado_em).toLocaleDateString("pt-BR") : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(o.valor_total)}</td>
                    <td className="px-4 py-2.5">
                      {o.nota_fiscal_emitir_depois ? (
                        <span
                          className="text-[10px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1"
                          style={{ background: "rgba(232,163,61,0.14)", color: "#C2801F" }}
                          title={o.nota_fiscal_observacao || ""}
                        >
                          <Clock size={11} />
                          Emitir depois
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
                          Sem NF
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex items-center gap-1 text-xs hover:underline" style={{ color: "var(--accent)" }}>
                        Ver pedido
                        <ExternalLink size={11} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : emitidasPeriodo.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhuma Nota Fiscal emitida nesse período.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Pedido</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Nº NF</th>
                <th className="text-left px-4 py-2.5">Emitida em</th>
                <th className="text-left px-4 py-2.5">Emitida por</th>
                <th className="text-right px-4 py-2.5">Valor</th>
              </tr>
            </thead>
            <tbody>
              {emitidasPeriodo.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => irParaPedido(o)}>
                  <td className="px-4 py-2.5 font-mono">#{o.numero_unidade}</td>
                  <td className="px-4 py-2.5">{o.clientes?.nome || "—"}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold">{o.nota_fiscal_numero}</td>
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">{fmtDataHora(o.nota_fiscal_emitida_em)}</td>
                  <td className="px-4 py-2.5 text-muted">{o.emissor?.nome || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(o.valor_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
