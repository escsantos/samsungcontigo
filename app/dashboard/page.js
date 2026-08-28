"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert, TrendingUp, ShoppingBag, Receipt, Wallet, UserPlus, CheckCircle2, AlertTriangle, PackageOpen
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell
} from "recharts";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { PERIODOS, calcularIntervalo } from "../../lib/periodo";
import { corCategoria } from "../../lib/categorias";
import { CORES_STATUS, ICONES_STATUS, ORDEM_STATUS } from "../../lib/estoque";
import { getUnidadeAtiva } from "../../lib/unidade";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtData(d) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function fmtMes(d) {
  return new Date(d).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [vendedores, setVendedores] = useState([]);
  const [vendedorFiltro, setVendedorFiltro] = useState("");

  const [orcamentos, setOrcamentos] = useState([]);
  const [pendencias, setPendencias] = useState([]);
  const [itens, setItens] = useState([]);
  const [itensLiberados, setItensLiberados] = useState([]);
  const [clientesNovos, setClientesNovos] = useState(0);

  const ehGestor = ["Administrador", "Diretor", "Gerente", "Supervisor"].includes(perfil?.cargo);
  const intervalo = useMemo(() => calcularIntervalo(periodo, dataDe, dataAte), [periodo, dataDe, dataAte]);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      if (["Administrador", "Diretor", "Gerente", "Supervisor"].includes(p?.cargo)) {
        const { data } = await supabase.from("perfis").select("id, nome").eq("cargo", "Vendedor").order("nome");
        setVendedores(data || []);
      }
      const unidadeAtiva = getUnidadeAtiva();
      let queryPend = supabase
        .from("orcamentos")
        .select("id, status, pedido_pai_id, parcial, clientes(nome)")
        .or("parcial.eq.true,pedido_pai_id.not.is.null")
        .eq("entregue", false);
      if (unidadeAtiva) queryPend = queryPend.eq("unidade_id", unidadeAtiva.id);
      const { data: pend } = await queryPend;
      setPendencias(pend || []);
    })();
  }, []);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"].includes(perfil?.cargo)) return;
    carregarDados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, intervalo, vendedorFiltro]);

  async function carregarDados() {
    setCarregando(true);
    const vendedorAlvo = perfil.cargo === "Vendedor" ? perfil.id : vendedorFiltro || null;
    const unidadeAtiva = getUnidadeAtiva();

    let queryOrc = supabase
      .from("orcamentos")
      .select("*, clientes(id, nome), perfis!orcamentos_vendedor_id_fkey(id, nome)")
      .order("criado_em", { ascending: true });
    if (unidadeAtiva) queryOrc = queryOrc.eq("unidade_id", unidadeAtiva.id);
    if (intervalo) queryOrc = queryOrc.gte("criado_em", intervalo.de.toISOString()).lte("criado_em", intervalo.ate.toISOString());
    if (vendedorAlvo) queryOrc = queryOrc.eq("vendedor_id", vendedorAlvo);
    const { data: orcs } = await queryOrc;
    setOrcamentos(orcs || []);

    const ids = (orcs || []).map((o) => o.id);
    if (ids.length > 0) {
      const { data: its } = await supabase.from("orcamento_itens").select("*").in("orcamento_id", ids);
      setItens(its || []);
    } else {
      setItens([]);
    }

    let queryLib = supabase
      .from("orcamento_itens")
      .select("*, orcamentos!inner(vendedor_id, criado_em, unidade_id)")
      .eq("liberado", true);
    if (unidadeAtiva) queryLib = queryLib.eq("orcamentos.unidade_id", unidadeAtiva.id);
    if (intervalo) queryLib = queryLib.gte("liberado_em", intervalo.de.toISOString()).lte("liberado_em", intervalo.ate.toISOString());
    if (vendedorAlvo) queryLib = queryLib.eq("orcamentos.vendedor_id", vendedorAlvo);
    const { data: lib } = await queryLib;
    setItensLiberados(lib || []);

    let queryCli = supabase.from("clientes").select("*", { count: "exact", head: true });
    if (intervalo) queryCli = queryCli.gte("criado_em", intervalo.de.toISOString()).lte("criado_em", intervalo.ate.toISOString());
    if (vendedorAlvo) {
      queryCli = queryCli.eq("vendedor_id", vendedorAlvo);
    } else if (unidadeAtiva) {
      // sem vendedor específico escolhido: conta só clientes da unidade ativa
      // (vinculados a um vendedor dessa unidade, ou ainda sem vendedor).
      const { data: vinculos } = await supabase.from("perfis_unidades").select("perfil_id").eq("unidade_id", unidadeAtiva.id);
      const idsDaUnidade = (vinculos || []).map((v) => v.perfil_id);
      queryCli = idsDaUnidade.length > 0
        ? queryCli.or(`vendedor_id.is.null,vendedor_id.in.(${idsDaUnidade.join(",")})`)
        : queryCli.is("vendedor_id", null);
    }
    const { count } = await queryCli;
    setClientesNovos(count || 0);

    setCarregando(false);
  }

  const totalVendas = orcamentos.reduce((s, o) => s + Number(o.valor_total || 0), 0);
  const totalPedidos = orcamentos.length;
  const ticketMedio = totalPedidos > 0 ? totalVendas / totalPedidos : 0;

  const revisados = orcamentos.filter((o) => o.status !== "Pendente de Análise").length;
  const aprovados = orcamentos.filter((o) => o.status !== "Pendente de Análise" && o.status !== "Rejeitado").length;
  const taxaAprovacao = revisados > 0 ? (aprovados / revisados) * 100 : 0;

  const lucroLiquidoReal = itensLiberados.reduce((acc, l) => {
    const impostoPct = Number(l.orcamentos?.imposto_total || 0);
    const custoTotal = Number(l.custo_real || 0) * l.qtd;
    const vendaTotal = Number(l.venda_total || 0);
    const impostoValor = vendaTotal * (impostoPct / 100);
    return acc + (vendaTotal - custoTotal - impostoValor);
  }, 0);

  const contagemStatus = {};
  ORDEM_STATUS.forEach((s) => (contagemStatus[s] = 0));
  contagemStatus["Rejeitado"] = 0;
  orcamentos.forEach((o) => {
    if (contagemStatus[o.status] !== undefined) contagemStatus[o.status]++;
  });

  const evolucao = useMemo(() => {
    const dias = intervalo ? Math.ceil((intervalo.ate - intervalo.de) / 86400000) : 999;
    const usarMes = dias > 45;
    const mapa = new Map();
    orcamentos.forEach((o) => {
      const chave = usarMes ? fmtMes(o.criado_em) : fmtData(o.criado_em);
      mapa.set(chave, (mapa.get(chave) || 0) + Number(o.valor_total || 0));
    });
    return Array.from(mapa.entries()).map(([data, valor]) => ({ data, valor }));
  }, [orcamentos, intervalo]);

  const vendasPorVendedor = useMemo(() => {
    const mapa = new Map();
    orcamentos.forEach((o) => {
      const nome = o.perfis?.nome || "Sem vendedor";
      mapa.set(nome, (mapa.get(nome) || 0) + Number(o.valor_total || 0));
    });
    return Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor);
  }, [orcamentos]);

  const CORES_PIZZA = ["#4A90D9", "#8B5CF6", "#3FA796", "#8BC34A", "#58B7D6", "#C97B4A", "#4338CA", "#8B93A1"];
  const vendasPorCategoria = useMemo(() => {
    const mapa = new Map();
    itens.forEach((i) => {
      mapa.set(i.categoria, (mapa.get(i.categoria) || 0) + Number(i.venda_total || 0));
    });
    return Array.from(mapa.entries()).map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
  }, [itens]);

  const topClientes = useMemo(() => {
    const mapa = new Map();
    orcamentos.forEach((o) => {
      const nome = o.clientes?.nome || "—";
      mapa.set(nome, (mapa.get(nome) || 0) + Number(o.valor_total || 0));
    });
    return Array.from(mapa.entries()).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [orcamentos]);

  const topPecas = useMemo(() => {
    const mapa = new Map();
    itens.forEach((i) => {
      const chave = `${i.codigo} — ${i.descricao_resumida}`;
      const atual = mapa.get(chave) || { qtd: 0, valor: 0 };
      mapa.set(chave, { qtd: atual.qtd + i.qtd, valor: atual.valor + Number(i.venda_total || 0) });
    });
    return Array.from(mapa.entries()).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.valor - a.valor).slice(0, 5);
  }, [itens]);

  if (perfil === undefined) {
    return <AppShell titulo="Dashboard de Vendas"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Dashboard de Vendas">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só a equipe comercial acessa o dashboard de vendas.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Dashboard de Vendas">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          {PERIODOS.map((p) => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} className={`chip ${periodo === p.id ? "chip-active" : ""}`}>
              {p.label}
            </button>
          ))}
          {periodo === "personalizado" && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" className="field-input py-1.5 text-xs" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
              <span className="text-xs text-muted">até</span>
              <input type="date" className="field-input py-1.5 text-xs" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
          )}
        </div>

        {ehGestor && vendedores.length > 0 && (
          <select className="field-input py-2 text-xs w-48" value={vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value)}>
            <option value="">Todos os vendedores</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        )}
      </div>

      {pendencias.length > 0 && (
        <button
          onClick={() => router.push("/estoque")}
          className="flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-full border border-line text-xs font-medium hover:bg-canvas mb-4"
        >
          <span className="relative w-2.5 h-2.5 rounded-full shrink-0" style={{ background: "#E1614F" }}>
            <span className="absolute inset-0 rounded-full animate-ping" style={{ background: "#E1614F", opacity: 0.7 }} />
          </span>
          {pendencias.length} pedido(s) com pendência de liberação parcial — ver no Estoque
        </button>
      )}

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
            <CardResumo icone={TrendingUp} cor="#4A90D9" label="Total em Vendas" valor={fmtBRL(totalVendas)} />
            <CardResumo icone={ShoppingBag} cor="#8B5CF6" label="Pedidos" valor={totalPedidos} />
            <CardResumo icone={Receipt} cor="#E8A33D" label="Ticket Médio" valor={fmtBRL(ticketMedio)} />
            <CardResumo icone={Wallet} cor="#3FA796" label="Lucro Líquido Real" valor={fmtBRL(lucroLiquidoReal)} />
            <CardResumo icone={UserPlus} cor="#E1614F" label="Clientes Novos" valor={clientesNovos} />
            <CardResumo icone={CheckCircle2} cor="#2C7C6E" label="Taxa de Aprovação" valor={`${taxaAprovacao.toFixed(0)}%`} />
          </div>

          <div className="card p-4 mb-5 overflow-x-auto">
            <p className="text-xs text-muted mb-3 font-medium">Pedidos por status</p>
            <div className="flex gap-2 min-w-[780px]">
              {[...ORDEM_STATUS, "Rejeitado"].map((s) => {
                const cor = CORES_STATUS[s];
                const Icone = ICONES_STATUS[s];
                return (
                  <div key={s} className="flex-1 rounded-lg p-2.5 text-center" style={{ background: cor.bg, color: cor.fg }}>
                    <div className="flex items-center justify-center gap-1">
                      {Icone && <Icone size={12} />}
                      <span className="font-mono font-bold text-sm">{contagemStatus[s] || 0}</span>
                    </div>
                    <div className="text-[9px] leading-tight mt-1">{s}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
            <div className="card p-5">
              <p className="font-display font-semibold text-sm mb-4">Evolução de vendas</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={evolucao}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="data" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmtBRL(v)} />
                  <Line type="monotone" dataKey="valor" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {ehGestor ? (
              <div className="card p-5">
                <p className="font-display font-semibold text-sm mb-4">Vendas por vendedor</p>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={vendasPorVendedor} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} width={100} />
                    <Tooltip formatter={(v) => fmtBRL(v)} />
                    <Bar dataKey="valor" fill="var(--accent)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="card p-5">
                <p className="font-display font-semibold text-sm mb-4">Vendas por categoria</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={vendasPorCategoria} dataKey="valor" nameKey="categoria" cx="50%" cy="50%" outerRadius={80} label={(d) => d.categoria}>
                      {vendasPorCategoria.map((_, i) => <Cell key={i} fill={CORES_PIZZA[i % CORES_PIZZA.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => fmtBRL(v)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {ehGestor && (
            <div className="card p-5 mb-5">
              <p className="font-display font-semibold text-sm mb-4">Vendas por categoria</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={vendasPorCategoria}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => fmtBRL(v)} />
                  <Bar dataKey="valor" radius={[4, 4, 0, 0]}>
                    {vendasPorCategoria.map((entry, i) => (
                      <Cell key={i} fill={corCategoria(entry.categoria).fg} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-5">
              <p className="font-display font-semibold text-sm mb-4">Top 5 clientes</p>
              {topClientes.length === 0 ? (
                <p className="text-xs text-muted">Sem dados no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {topClientes.map((c, i) => (
                    <div key={c.nome} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{i + 1}</span>
                        {c.nome}
                      </span>
                      <span className="font-mono font-semibold">{fmtBRL(c.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="card p-5">
              <p className="font-display font-semibold text-sm mb-4">Top 5 peças mais vendidas</p>
              {topPecas.length === 0 ? (
                <p className="text-xs text-muted">Sem dados no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {topPecas.map((p, i) => (
                    <div key={p.nome} className="flex items-center justify-between text-sm gap-3">
                      <span className="flex items-center gap-2 truncate">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{i + 1}</span>
                        <span className="truncate">{p.nome}</span>
                      </span>
                      <span className="font-mono text-muted shrink-0">{p.qtd}un · {fmtBRL(p.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function CardResumo({ icone: Icone, cor, label, valor }) {
  return (
    <div className="card p-4">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2.5" style={{ background: `${cor}22`, color: cor }}>
        <Icone size={15} />
      </div>
      <p className="font-mono font-bold text-lg leading-tight">{valor}</p>
      <p className="text-[11px] text-muted mt-0.5">{label}</p>
    </div>
  );
}
