"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ChevronRight, AlertTriangle } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { ORDEM_STATUS, CORES_STATUS, ICONES_STATUS } from "../../lib/estoque";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EstoquePage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState(null);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase
        .from("orcamentos")
        .select("*, clientes(nome)")
        .neq("status", "Pendente de Análise")
        .order("criado_em", { ascending: false });
      setLista(data || []);
      setCarregando(false);
    })();
  }, []);

  if (perfil === undefined) {
    return <AppShell titulo="Estoque"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Estoque"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Estoque">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente e Estoque acessam esta página.</p>
        </div>
      </AppShell>
    );
  }

  const contagem = {};
  ORDEM_STATUS.forEach((s) => (contagem[s] = 0));
  lista.forEach((o) => { if (contagem[o.status] !== undefined) contagem[o.status]++; });
  const rejeitados = lista.filter((o) => o.status === "Rejeitado").length;
  const pendencias = lista.filter((o) => o.parcial || o.pedido_pai_id);

  const filtrados = filtro ? lista.filter((o) => o.status === filtro) : lista;

  return (
    <AppShell titulo="Estoque">
      {pendencias.length > 0 && (
        <div className="card p-4 mb-4" style={{ borderColor: "#E8A33D" }}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} style={{ color: "#C2801F" }} />
            <p className="font-display font-semibold text-sm">{pendencias.length} pedido(s) com pendência de liberação parcial</p>
          </div>
          <div className="space-y-1.5">
            {pendencias.map((o) => (
              <button
                key={o.id}
                onClick={() => router.push(`/estoque/${o.id}`)}
                className="w-full text-left flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg hover:bg-canvas"
              >
                <span>
                  Pedido #{o.id} — {o.clientes?.nome || "—"}{" "}
                  {o.pedido_pai_id ? (
                    <span className="text-muted">(peça pendente do pedido #{o.pedido_pai_id})</span>
                  ) : (
                    <span className="text-muted">(liberado parcialmente, aguardando o restante)</span>
                  )}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded" style={{ background: (CORES_STATUS[o.status] || {}).bg, color: (CORES_STATUS[o.status] || {}).fg }}>
                  {o.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5 mb-4 overflow-x-auto">
        <p className="font-display font-semibold text-[15px] mb-4">Linha do tempo dos pedidos</p>
        <div className="flex items-stretch gap-1 min-w-[900px]">
          {ORDEM_STATUS.map((s, i) => {
            const cor = CORES_STATUS[s];
            const Icone = ICONES_STATUS[s];
            const ativo = filtro === s;
            return (
              <div key={s} className="flex items-center flex-1">
                <button
                  onClick={() => setFiltro(ativo ? null : s)}
                  className="flex-1 rounded-xl p-3.5 text-center transition hover:-translate-y-0.5"
                  style={{
                    background: ativo ? cor.fg : cor.bg,
                    color: ativo ? "#fff" : cor.fg,
                    outline: ativo ? `2px solid ${cor.fg}` : "none",
                    outlineOffset: "2px",
                    boxShadow: ativo ? "0 4px 10px rgba(0,0,0,0.12)" : "0 1px 0 rgba(0,0,0,0.04), 0 2px 4px rgba(20,24,31,0.05)"
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-2"
                    style={{ background: ativo ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.6)" }}
                  >
                    <Icone size={17} />
                  </div>
                  <div className="font-mono font-bold text-xl">{contagem[s]}</div>
                  <div className="text-[10px] leading-tight mt-1">{s}</div>
                </button>
                {i < ORDEM_STATUS.length - 1 && <ChevronRight size={16} className="text-muted mx-0.5 shrink-0" />}
              </div>
            );
          })}
        </div>
        {rejeitados > 0 && (
          <button
            onClick={() => setFiltro(filtro === "Rejeitado" ? null : "Rejeitado")}
            className="mt-3 text-xs font-mono px-3 py-1.5 rounded-full"
            style={{
              background: filtro === "Rejeitado" ? "var(--danger)" : "var(--danger-soft)",
              color: filtro === "Rejeitado" ? "#fff" : "var(--danger)"
            }}
          >
            {rejeitados} rejeitado(s)
          </button>
        )}
      </div>

      <div className="flex justify-between items-center mb-3">
        <p className="text-sm text-muted">{filtrados.length} pedido(s) {filtro ? `em "${filtro}"` : ""}</p>
        {filtro && <button className="text-xs" style={{ color: "var(--accent)" }} onClick={() => setFiltro(null)}>Limpar filtro</button>}
      </div>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum pedido aqui.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">#</th>
                <th className="text-left px-4 py-2.5">Cliente</th>
                <th className="text-left px-4 py-2.5">Data</th>
                <th className="text-right px-4 py-2.5">Total</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((o) => {
                const cor = CORES_STATUS[o.status] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
                const IconeStatus = ICONES_STATUS[o.status];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                    onClick={() => router.push(`/estoque/${o.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted">#{o.id}</td>
                    <td className="px-4 py-2.5 font-medium">
                      {o.clientes?.nome || "—"}
                      {(o.parcial || o.pedido_pai_id) && (
                        <span className="ml-2 text-[9.5px] font-mono font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(232,163,61,0.14)", color: "#C2801F" }}>
                          PARCIAL
                        </span>
                      )}
                    </td>
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
