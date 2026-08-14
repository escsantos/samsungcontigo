"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Check, ArrowLeft, ChevronDown } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function semanaDeData(dataStr) {
  const d = new Date(dataStr);
  const dayNr = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dayNr);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    key: monday.toISOString().slice(0, 10),
    label: `Semana de ${monday.toLocaleDateString("pt-BR")} a ${sunday.toLocaleDateString("pt-BR")}`
  };
}

const MODOS = [
  { id: "semana", label: "Semana" },
  { id: "cliente", label: "Cliente" },
  { id: "data", label: "Data" }
];

export default function PagamentoFabricantePage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState("semana");
  const [abertos, setAbertos] = useState({});
  const [processando, setProcessando] = useState(null);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (["Administrador", "Financeiro"].includes(p?.cargo)) carregar();
    })();
  }, []);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("orcamento_itens")
      .select("*, orcamentos!inner(id, entregue, entregue_em, clientes(nome))")
      .eq("liberado", true)
      .eq("custo_pago_fabricante", false)
      .eq("orcamentos.entregue", true)
      .order("id");
    setItens(data || []);
    setCarregando(false);
  }

  const grupos = useMemo(() => {
    const mapa = new Map();
    for (const i of itens) {
      const entregueEm = i.orcamentos?.entregue_em;
      if (!entregueEm) continue;
      let key, label;
      if (modo === "semana") {
        const s = semanaDeData(entregueEm);
        key = s.key;
        label = s.label;
      } else if (modo === "cliente") {
        key = i.orcamentos?.clientes?.nome || "—";
        label = key;
      } else {
        key = new Date(entregueEm).toISOString().slice(0, 10);
        label = new Date(entregueEm).toLocaleDateString("pt-BR");
      }
      if (!mapa.has(key)) mapa.set(key, { label, itens: [], custoTotal: 0 });
      const g = mapa.get(key);
      const custoItem = Number(i.custo_real || 0) * i.qtd;
      g.itens.push({ ...i, custoItem });
      g.custoTotal += custoItem;
    }
    return Array.from(mapa.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.key.localeCompare(a.key));
  }, [itens, modo]);

  function alternarGrupo(key) {
    setAbertos((a) => ({ ...a, [key]: !a[key] }));
  }

  async function validarGrupo(grupo) {
    setProcessando(grupo.key);
    const { data: { user } } = await supabase.auth.getUser();
    const ids = grupo.itens.map((i) => i.id);
    await supabase
      .from("orcamento_itens")
      .update({ custo_pago_fabricante: true, custo_pago_fabricante_por: user.id, custo_pago_fabricante_em: new Date().toISOString() })
      .in("id", ids);
    setProcessando(null);
    carregar();
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
      <button onClick={() => router.push("/financeiro")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para o Dashboard Financeiro
      </button>

      <p className="text-sm text-muted mb-3">Peças já entregues ao cliente, com custo real confirmado, aguardando marcar que a Samsung foi paga.</p>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted">Agrupar por:</span>
        {MODOS.map((m) => (
          <button key={m.id} onClick={() => setModo(m.id)} className={`chip ${modo === m.id ? "chip-active" : ""}`}>
            {m.label}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : grupos.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted">Nenhuma pendência de pagamento ao fabricante.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const aberto = !!abertos[g.key];
            return (
              <div key={g.key} className="card overflow-hidden">
                <div className="p-4 flex items-center justify-between flex-wrap gap-3">
                  <button onClick={() => alternarGrupo(g.key)} className="flex items-center gap-2 text-left">
                    <ChevronDown size={16} className="text-muted transition-transform" style={{ transform: aberto ? "rotate(180deg)" : "rotate(0deg)" }} />
                    <div>
                      <p className="font-display font-semibold text-sm">{g.label}</p>
                      <p className="text-xs text-muted mt-0.5">{g.itens.length} peça(s) · Custo total: <b className="text-ink font-mono">{fmtBRL(g.custoTotal)}</b></p>
                    </div>
                  </button>
                  <button className="btn-primary py-2 text-xs" disabled={processando === g.key} onClick={() => validarGrupo(g)}>
                    <Check size={14} />
                    Validar {MODOS.find((m) => m.id === modo)?.label.toLowerCase()} inteira
                  </button>
                </div>
                {aberto && (
                  <div className="border-t border-line overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                          <th className="text-left px-4 py-2">Pedido</th>
                          <th className="text-left px-4 py-2">Cliente</th>
                          <th className="text-left px-4 py-2">Código</th>
                          <th className="text-center px-4 py-2">Qtd</th>
                          <th className="text-right px-4 py-2">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.itens.map((i) => (
                          <tr key={i.id} className="border-b border-line last:border-0">
                            <td className="px-4 py-2 font-mono text-muted">#{i.orcamentos?.id}</td>
                            <td className="px-4 py-2">{i.orcamentos?.clientes?.nome || "—"}</td>
                            <td className="px-4 py-2 font-mono" style={{ color: "var(--accent)" }}>{i.codigo}</td>
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
    </AppShell>
  );
}
