"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ChevronRight } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { ORDEM_STATUS, CORES_STATUS } from "../../lib/estoque";

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

  const filtrados = filtro ? lista.filter((o) => o.status === filtro) : lista;

  return (
    <AppShell titulo="Estoque">
      <div className="card p-5 mb-4 overflow-x-auto">
        <p className="font-display font-semibold text-[15px] mb-4">Linha do tempo dos pedidos</p>
        <div className="flex items-stretch gap-1 min-w-[900px]">
          {ORDEM_STATUS.map((s, i) => {
            const cor = CORES_STATUS[s];
            const ativo = filtro === s;
            return (
              <div key={s} className="flex items-center flex-1">
                <button
                  onClick={() => setFiltro(ativo ? null : s)}
                  className="flex-1 rounded-xl p-3 text-center transition"
                  style={{
                    background: ativo ? cor.fg : cor.bg,
                    color: ativo ? "#fff" : cor.fg,
                    outline: ativo ? `2px solid ${cor.fg}` : "none",
                    outlineOffset: "2px"
                  }}
                >
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
                return (
                  <tr
                    key={o.id}
                    className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                    onClick={() => router.push(`/estoque/${o.id}`)}
                  >
                    <td className="px-4 py-2.5 font-mono text-muted">#{o.id}</td>
                    <td className="px-4 py-2.5 font-medium">{o.clientes?.nome || "—"}</td>
                    <td className="px-4 py-2.5 text-muted">{new Date(o.criado_em).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtBRL(o.valor_total)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded" style={{ background: cor.bg, color: cor.fg }}>
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
