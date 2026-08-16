"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldAlert, Wallet, TrendingDown, TrendingUp, ClipboardCheck, Truck, ChevronRight, Percent, Tag
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { PERIODOS, calcularIntervalo } from "../../lib/periodo";

function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "R$ 0,00";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtBRLCompacto(v) {
  if (!v) return "R$ 0";
  if (Math.abs(v) >= 1000) return "R$ " + (v / 1000).toFixed(1).replace(".", ",") + "k";
  return fmtBRL(v);
}
function noPeriodo(dataStr, intervalo) {
  if (!dataStr) return false;
  if (!intervalo) return true;
  const t = new Date(dataStr).getTime();
  return t >= intervalo.de.getTime() && t <= intervalo.ate.getTime();
}
function diaLabel(dataStr) {
  const d = new Date(dataStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function FinanceiroDashboardPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [carregando, setCarregando] = useState(true);
  const [periodo, setPeriodo] = useState("mes");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");

  const [orcamentosConfirmados, setOrcamentosConfirmados] = useState([]);
  const [itensPagosFabricante, setItensPagosFabricante] = useState([]);
  const [pendentesRecebimento, setPendentesRecebimento] = useState(0);
  const [pendentesFabricante, setPendentesFabricante] = useState(0);

  const intervalo = useMemo(() => calcularIntervalo(periodo, dataDe, dataAte), [periodo, dataDe, dataAte]);

  const confirmadosPeriodo = orcamentosConfirmados.filter((o) => noPeriodo(o.recebimento_confirmado_em, intervalo));
  const itensPagosPeriodo = itensPagosFabricante.filter((i) => noPeriodo(i.custo_pago_fabricante_em, intervalo));
  const dadosGrafico = useMemoDiario(confirmadosPeriodo, itensPagosPeriodo);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
    })();
  }, []);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!["Administrador", "Financeiro"].includes(perfil?.cargo)) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function carregar() {
    setCarregando(true);

    // busca todos os pedidos com algum pagamento registrado (via tabela real de pagamentos,
    // nunca confiando só no campo valor_pago, que só é atualizado no Faturamento Efetuado)
    const { data: todosPagamentos } = await supabase.from("pagamentos_orcamento").select("orcamento_id, valor");
    const pagoPorPedido = {};
    (todosPagamentos || []).forEach((p) => {
      pagoPorPedido[p.orcamento_id] = (pagoPorPedido[p.orcamento_id] || 0) + Number(p.valor || 0);
    });

    const { data: orcs } = await supabase
      .from("orcamentos")
      .select("id, valor_total, desconto, valor_herdado_pai, recebimento_confirmado, recebimento_confirmado_em");

    const comValorReal = (orcs || [])
      .map((o) => ({ ...o, valorRealPago: (pagoPorPedido[o.id] || 0) + Number(o.valor_herdado_pai || 0) }))
      .filter((o) => o.valorRealPago > 0.004);

    setOrcamentosConfirmados(comValorReal.filter((o) => o.recebimento_confirmado));
    setPendentesRecebimento(comValorReal.filter((o) => !o.recebimento_confirmado).length);

    const { data: itens } = await supabase
      .from("orcamento_itens")
      .select("id, custo_real, qtd, custo_pago_fabricante, custo_pago_fabricante_em")
      .eq("liberado", true);
    setItensPagosFabricante((itens || []).filter((i) => i.custo_pago_fabricante));
    setPendentesFabricante((itens || []).filter((i) => !i.custo_pago_fabricante).length);

    setCarregando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Financeiro"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Financeiro"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Financeiro">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Financeiro (e o Administrador) acessam esta área.</p>
        </div>
      </AppShell>
    );
  }

  const recebidoPeriodo = confirmadosPeriodo.reduce((s, o) => s + o.valorRealPago, 0);
  const descontoPeriodo = confirmadosPeriodo.reduce((s, o) => s + Number(o.desconto || 0), 0);

  const pagoFabricantePeriodo = itensPagosPeriodo.reduce((s, i) => s + Number(i.custo_real || 0) * i.qtd, 0);

  const margemPeriodo = recebidoPeriodo - pagoFabricantePeriodo;
  const margemPercentual = recebidoPeriodo > 0 ? (margemPeriodo / recebidoPeriodo) * 100 : 0;

  return (
    <AppShell titulo="Dashboard Financeiro">
      <div className="flex items-center gap-2 flex-wrap mb-5">
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

      {carregando ? (
        <p className="text-sm text-muted">Carregando...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
            <div className="card p-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
                <TrendingUp size={17} />
              </div>
              <p className="text-xs text-muted mb-0.5">Recebido confirmado</p>
              <p className="font-mono font-bold text-2xl">{fmtBRL(recebidoPeriodo)}</p>
            </div>
            <div className="card p-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(214,51,108,0.14)", color: "#D6336C" }}>
                <Tag size={17} />
              </div>
              <p className="text-xs text-muted mb-0.5">Descontos concedidos</p>
              <p className="font-mono font-bold text-2xl" style={{ color: "#D6336C" }}>-{fmtBRL(descontoPeriodo)}</p>
            </div>
            <div className="card p-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(225,97,79,0.14)", color: "#E1614F" }}>
                <TrendingDown size={17} />
              </div>
              <p className="text-xs text-muted mb-0.5">Pago ao fabricante</p>
              <p className="font-mono font-bold text-2xl">{fmtBRL(pagoFabricantePeriodo)}</p>
            </div>
            <div className="card p-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                <Wallet size={17} />
              </div>
              <p className="text-xs text-muted mb-0.5">Margem do período</p>
              <p className="font-mono font-bold text-2xl" style={{ color: margemPeriodo >= 0 ? "#2C7C6E" : "var(--danger)" }}>{fmtBRL(margemPeriodo)}</p>
            </div>
            <div className="card p-5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-3" style={{ background: "rgba(99,102,241,0.14)", color: "#4338CA" }}>
                <Percent size={17} />
              </div>
              <p className="text-xs text-muted mb-0.5">Margem de lucro líquido</p>
              <p className="font-mono font-bold text-2xl" style={{ color: margemPercentual >= 0 ? "#2C7C6E" : "var(--danger)" }}>{margemPercentual.toFixed(1)}%</p>
            </div>
          </div>

          {dadosGrafico.length > 0 && (
            <div className="card p-5 mb-5">
              <p className="font-display font-semibold text-sm mb-4">Recebido x Pago ao fabricante</p>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={dadosGrafico} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                  <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtBRLCompacto} width={64} />
                  <Tooltip formatter={(v) => fmtBRL(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="recebido" name="Recebido" fill="#2C7C6E" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pago" name="Pago ao fabricante" fill="#E1614F" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => router.push("/financeiro/recebimentos")}
              className="card p-5 text-left hover:-translate-y-0.5 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
                  <ClipboardCheck size={19} />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Confirmar Recebimentos</p>
                  <p className="text-xs text-muted mt-0.5">{pendentesRecebimento} pedido(s) aguardando confirmação</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
            <button
              onClick={() => router.push("/financeiro/fornecedor")}
              className="card p-5 text-left hover:-translate-y-0.5 transition flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(225,97,79,0.14)", color: "#E1614F" }}>
                  <Truck size={19} />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">Pagamento ao Fabricante</p>
                  <p className="text-xs text-muted mt-0.5">{pendentesFabricante} peça(s) aguardando confirmação</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted" />
            </button>
          </div>
        </>
      )}
    </AppShell>
  );
}

function useMemoDiario(confirmados, itensPagos) {
  return useMemo(() => {
    const mapa = new Map();
    confirmados.forEach((o) => {
      if (!o.recebimento_confirmado_em) return;
      const dia = diaLabel(o.recebimento_confirmado_em);
      const atual = mapa.get(dia) || { dia, recebido: 0, pago: 0 };
      atual.recebido += o.valorRealPago;
      mapa.set(dia, atual);
    });
    itensPagos.forEach((i) => {
      if (!i.custo_pago_fabricante_em) return;
      const dia = diaLabel(i.custo_pago_fabricante_em);
      const atual = mapa.get(dia) || { dia, recebido: 0, pago: 0 };
      atual.pago += Number(i.custo_real || 0) * i.qtd;
      mapa.set(dia, atual);
    });
    return Array.from(mapa.values()).sort((a, b) => {
      const [da, ma] = a.dia.split("/").map(Number);
      const [db, mb] = b.dia.split("/").map(Number);
      return ma - mb || da - db;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmados, itensPagos]);
}
