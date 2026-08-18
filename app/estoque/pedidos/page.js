"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { ORDEM_STATUS, CORES_STATUS, ICONES_STATUS } from "../../../lib/estoque";
import { PERIODOS, calcularIntervalo } from "../../../lib/periodo";
import { getUnidadeAtiva } from "../../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OPCOES_STATUS = ["Todos", ...ORDEM_STATUS, "Entregue", "Rejeitado"];

export default function RelatorioPedidosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [pagosPorPedido, setPagosPorPedido] = useState({});
  const [vendedores, setVendedores] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const [periodo, setPeriodo] = useState("tudo");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("Todos");
  const [vendedorFiltro, setVendedorFiltro] = useState("");
  const [clienteBusca, setClienteBusca] = useState("");

  const intervalo = useMemo(() => calcularIntervalo(periodo, dataDe, dataAte), [periodo, dataDe, dataAte]);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (["Administrador", "Diretor", "Gerente"].includes(p?.cargo)) {
        const { data } = await supabase.from("perfis").select("id, nome").eq("cargo", "Vendedor").order("nome");
        setVendedores(data || []);
      }
    })();
  }, []);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!["Administrador", "Diretor", "Gerente", "Estoque"].includes(perfil?.cargo)) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function carregar() {
    setCarregando(true);
    const unidadeAtiva = getUnidadeAtiva();
    let query = supabase
      .from("orcamentos")
      .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
      .order("criado_em", { ascending: false });
    if (unidadeAtiva) query = query.eq("unidade_id", unidadeAtiva.id);
    const { data } = await query;
    setLista(data || []);

    // valor pago de verdade: soma direto da tabela de pagamentos + o que foi herdado
    // do pedido pai (liberação parcial) — nunca confia no campo valor_pago sozinho,
    // que só é atualizado no momento exato do Faturamento Efetuado.
    const idsPedidos = (data || []).map((o) => o.id);
    const { data: pagamentos } = idsPedidos.length
      ? await supabase.from("pagamentos_orcamento").select("orcamento_id, valor").in("orcamento_id", idsPedidos)
      : { data: [] };
    const somaPorPedido = {};
    (pagamentos || []).forEach((p) => {
      somaPorPedido[p.orcamento_id] = (somaPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
    });
    (data || []).forEach((o) => {
      somaPorPedido[o.id] = (somaPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0);
    });
    setPagosPorPedido(somaPorPedido);

    setCarregando(false);
  }

  const filtrados = useMemo(() => {
    return lista.filter((o) => {
      if (intervalo) {
        const t = new Date(o.criado_em).getTime();
        if (t < intervalo.de.getTime() || t > intervalo.ate.getTime()) return false;
      }
      if (statusFiltro === "Entregue" && !o.entregue) return false;
      if (statusFiltro !== "Todos" && statusFiltro !== "Entregue" && o.status !== statusFiltro) return false;
      if (vendedorFiltro && o.vendedor_id !== vendedorFiltro) return false;
      if (clienteBusca.trim() && !(o.clientes?.nome || "").toLowerCase().includes(clienteBusca.trim().toLowerCase())) return false;
      return true;
    });
  }, [lista, intervalo, statusFiltro, vendedorFiltro, clienteBusca]);

  const totalGeral = filtrados.reduce((s, o) => s + Number(o.valor_total || 0), 0);
  const totalBruto = filtrados.reduce((s, o) => s + Number(o.valor_total || 0) + Number(o.desconto || 0), 0);
  const totalDesconto = filtrados.reduce((s, o) => s + Number(o.desconto || 0), 0);
  const totalPago = filtrados.reduce((s, o) => s + (pagosPorPedido[o.id] || 0), 0);

  function exportarExcel() {
    const linhas = filtrados.map((o) => ({
      Pedido: o.id,
      Cliente: o.clientes?.nome || "",
      Vendedor: o.perfis?.nome || "",
      "Data criação": new Date(o.criado_em).toLocaleDateString("pt-BR"),
      Status: o.entregue ? "Entregue" : o.status,
      Parcial: o.parcial || o.pedido_pai_id ? "Sim" : "Não",
      "Nº pedido de compra": o.numero_pedido_compra || "",
      "Valor bruto (R$)": Number(Number(o.valor_total || 0) + Number(o.desconto || 0)).toFixed(2),
      "Desconto (R$)": Number(o.desconto || 0).toFixed(2),
      "Valor total líquido (R$)": Number(o.valor_total || 0).toFixed(2),
      "Valor pago (R$)": Number((pagosPorPedido[o.id] || 0)).toFixed(2),
      "Data entrega": o.entregue_em ? new Date(o.entregue_em).toLocaleDateString("pt-BR") : ""
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 18 }, { wch: 13 }, { wch: 28 }, { wch: 8 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 15 }, { wch: 13 }, { wch: 13 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `relatorio-pedidos-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Relatório de Pedidos"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Estoque"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Relatório de Pedidos">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente e Estoque acessam este relatório.</p>
        </div>
      </AppShell>
    );
  }

  const ehGestor = ["Administrador", "Diretor", "Gerente"].includes(perfil.cargo);

  return (
    <AppShell titulo="Relatório de Pedidos">
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
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
          <button className="btn-primary text-xs py-2 ml-auto" onClick={exportarExcel}>
            <Download size={14} />
            Exportar Excel
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="field-label">Status</label>
            <select className="field-input" value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)}>
              {OPCOES_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {ehGestor && (
            <div>
              <label className="field-label">Vendedor</label>
              <select className="field-input" value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
                <option value="">Todos</option>
                {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="field-label">Cliente</label>
            <input className="field-input" placeholder="Buscar por nome..." value={clienteBusca} onChange={(e) => setClienteBusca(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Pedidos</p>
          <p className="font-mono font-bold text-lg">{filtrados.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Valor bruto</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totalBruto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Descontos</p>
          <p className="font-mono font-bold text-lg" style={{ color: "#D6336C" }}>-{fmtBRL(totalDesconto)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Valor líquido</p>
          <p className="font-mono font-bold text-lg">{fmtBRL(totalGeral)}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Valor pago</p>
          <p className="font-mono font-bold text-lg" style={{ color: "#2C7C6E" }}>{fmtBRL(totalPago)}</p>
        </div>
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum pedido encontrado com esses filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="text-left px-3 py-2.5 whitespace-nowrap" style={{ width: "8%" }}>Pedido</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap" style={{ width: "22%" }}>Cliente</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap" style={{ width: "14%" }}>Vendedor</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap" style={{ width: "9%" }}>Data</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap" style={{ width: "10%" }}>Desconto</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap" style={{ width: "11%" }}>Total</th>
                  <th className="text-right px-3 py-2.5 whitespace-nowrap" style={{ width: "11%" }}>Pago</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap" style={{ width: "15%" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((o) => {
                  const cor = o.entregue ? { bg: "rgba(44,124,110,0.16)", fg: "#2C7C6E" } : (CORES_STATUS[o.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" });
                  const IconeStatus = ICONES_STATUS[o.status];
                  const pago = pagosPorPedido[o.id] || 0;
                  return (
                    <tr key={o.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => router.push(`/estoque/${o.id}`)}>
                      <td className="px-3 py-2.5 font-mono text-muted whitespace-nowrap">#{o.numero_unidade}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis">
                        <span className="font-medium">{o.clientes?.nome || "—"}</span>
                        {(o.parcial || o.pedido_pai_id) && (
                          <span className="ml-1.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(232,163,61,0.14)", color: "#C2801F" }}>
                            PARCIAL
                          </span>
                        )}
                        {o.sem_pagamento && (
                          <span className="ml-1.5 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(214,51,108,0.14)", color: "#D6336C" }}>
                            SEM PAGTO
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted whitespace-nowrap overflow-hidden text-ellipsis">{o.perfis?.nome || "—"}</td>
                      <td className="px-3 py-2.5 text-muted whitespace-nowrap">{new Date(o.criado_em).toLocaleDateString("pt-BR")}</td>
                      <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap" style={{ color: Number(o.desconto) > 0 ? "#D6336C" : undefined }}>
                        {Number(o.desconto) > 0 ? `-${fmtBRL(o.desconto)}` : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold whitespace-nowrap">{fmtBRL(o.valor_total)}</td>
                      <td className="px-3 py-2.5 text-right font-mono whitespace-nowrap" style={{ color: pago >= Number(o.valor_total) - 0.004 && pago > 0 ? "#2C7C6E" : undefined }}>
                        {fmtBRL(pago)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
                          {IconeStatus && <IconeStatus size={11} />}
                          {o.entregue ? "Entregue" : o.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
