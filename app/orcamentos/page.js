"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getPerfilAtual, supabase } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { CORES_STATUS, ICONES_STATUS } from "../../lib/estoque";

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

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase
        .from("orcamentos")
        .select("*, clientes(nome), perfis!orcamentos_vendedor_id_fkey(nome)")
        .order("criado_em", { ascending: false });
      setLista(data || []);
      setCarregando(false);
    })();
  }, []);

  const ehCliente = perfil?.cargo === "Cliente";

  return (
    <AppShell titulo="Orçamentos">
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
                    {!ehCliente && <td className="px-4 py-2.5 font-medium">{o.clientes?.nome || "—"}</td>}
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
