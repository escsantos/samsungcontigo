"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { ORDEM_STATUS, CORES_STATUS, ICONES_STATUS } from "../../../lib/estoque";
import { PERIODOS, calcularIntervalo } from "../../../lib/periodo";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OPCOES_STATUS = ["Todos", ...ORDEM_STATUS, "Entregue", "Rejeitado"];

export default function RelatorioPedidosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
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
    const { data } = await supabase
      .from("orcamentos")
      .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
      .order("criado_em", { ascending: false });
    setLista(data || []);
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
  const totalPago = filtrados.reduce((s, o) => s + Number(o.valor_pago || 0), 0);

  function exportarExcel() {
    const linhas = filtrados.map((o) => ({
      Pedido: o.id,
      Cliente: o.clientes?.nome || "",
      Vendedor: o.perfis?.nome || "",
      "Data criação": new Date(o.criado_em).toLocaleDateString("pt-BR"),
      Status: o.entregue ? "Entregue" : o.status,
      Parcial: o.parcial || o.pedido_pai_id ? "Sim" : "Não",
      "Nº pedido de compra": o.numero_pedido_compra || "",
      "Valor total (R$)": Number(o.valor_total || 0),
      "Valor pago (R$)": Number(o.valor_pago || 0),
      "Data pagamento": o.data_pagamento ? new Date(o.data_pagamento + "T00:00:00").toLocaleDateString("pt-BR") : "",
      "Data entrega": o.entregue_em ? new Date(o.entregue_em).toLocaleDateString("pt-BR") : ""
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [{ wch: 8 }, { wch: 24 }, { wch: 18 }, { wch: 13 }, { wch: 28 }, { wch: 8 }, { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }];
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

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Pedidos encontrados</p>
          <p className="font-mono font-bold text-lg">{filtrados.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted mb-1">Valor total</p>
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
          <div className="overflow-auto max-h-[calc(100vh-420px)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">#</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Cliente</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Vendedor</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Data</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">Total</th>
                  <th className="sticky top-0 bg-canvas text-right px-4 py-2.5">Pago</th>
                  <th className="sticky top-0 bg-canvas text-left px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((o) => {
                  const cor = o.entregue ? { bg: "rgba(44,124,110,0.16)", fg: "#2C7C6E" } : (CORES_STATUS[o.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" });
                  const IconeStatus = ICONES_STATUS[o.status];
                  return (
                    <tr key={o.id} className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer" onClick={() => router.push(`/estoque/${o.id}`)}>
                      <td className="px-4 py-2.5 font-mono text-muted">#{o.id}</td>
                      <td className="px-4 py-2.5 font-medium">
                        {o.clientes?.nome || "—"}
                        {(o.parcial || o.pedido_pai_id) && (
                          <span className="ml-2 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(232,163,61,0.14)", color: "#C2801F" }}>
                            PARCIAL
                          </span>
                        )}
                        {o.sem_pagamento && (
                          <span className="ml-2 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(214,51,108,0.14)", color: "#D6336C" }}>
                            SEM PAGAMENTO
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-muted">{o.perfis?.nome || "—"}</td>
                      <td className="px-4 py-2.5 text-muted">{new Date(o.criado_em).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(o.valor_total)}</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmtBRL(o.valor_pago)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1.5" style={{ background: cor.bg, color: cor.fg }}>
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
