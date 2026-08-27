"use client";
import { useEffect, useState } from "react";
import { Cable, Percent, Hash, Store } from "lucide-react";
import AppShell from "../../../components/AppShell";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { formatarMoedaSemSimbolo, mesReferenciaLabel } from "../../../lib/formato";

function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function ConteudoAcessorios() {
  const { unidades } = useSessao();
  const [unidadeId, setUnidadeId] = useState(""); // "" = todas as unidades que eu tenho acesso
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    if (unidades.length === 0) return;
    setCarregando(true);
    const { data: categoriaAcessorio } = await supabase.from("categorias").select("id").eq("nome", "Acessório").single();
    if (!categoriaAcessorio) {
      setCarregando(false);
      return;
    }

    let query = supabase
      .from("lancamentos")
      .select("valor_pago, tipos_servico(nome)")
      .eq("categoria_id", categoriaAcessorio.id)
      .gte("data", inicioMes());

    query = unidadeId ? query.eq("unidade_id", unidadeId) : query.in("unidade_id", unidades.map((u) => u.id));

    const { data: lancs } = await query;

    const mapa = {};
    (lancs || []).forEach((l) => {
      const nome = l.tipos_servico?.nome || "Outros";
      if (!mapa[nome]) mapa[nome] = { nome, valor: 0, qtd: 0 };
      mapa[nome].valor += Number(l.valor_pago);
      mapa[nome].qtd += 1;
    });

    setLinhas(Object.values(mapa).sort((a, b) => b.valor - a.valor));
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [unidades, unidadeId]);

  const totalValor = linhas.reduce((s, l) => s + l.valor, 0);
  const totalQtd = linhas.reduce((s, l) => s + l.qtd, 0);
  const totalPremio = totalValor * 0.05;

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Acessórios de {mesReferenciaLabel(inicioMes())}</h1>
          <p className="text-sm text-muted mt-1">Vendas de acessórios por tipo de item.</p>
        </div>
        <div className="flex items-end gap-3 shrink-0">
          {unidades.length > 1 && (
            <div className="w-64 shrink-0">
              <label className="field-label flex items-center gap-1.5"><Store size={12} className="text-muted" /> Unidade</label>
              <select className="field-input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
                <option value="">Todas as unidades</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>
          )}
          <BotaoAtualizar aoAtualizar={carregar} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2670B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2670B5]/10 flex items-center justify-center text-[#2670B5] mb-2"><Cable size={16} /></div>
            <p className="text-xs text-muted mb-1">Total de acessórios vendidos</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalValor)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">Total de prêmios (5%)</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C7E13]">R$ {formatarMoedaSemSimbolo(totalPremio)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C819C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C819C]/10 flex items-center justify-center text-[#7C819C] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Quantidade vendida</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{totalQtd}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Tipo do acessório</td>
              <td className="p-3 text-right">Valor da venda</td>
              <td className="p-3 text-right">Quantidade vendida</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={3}>Carregando…</td></tr>}
            {!carregando && linhas.length === 0 && <tr><td className="p-4 text-muted" colSpan={3}>Nenhuma venda de acessório no mês.</td></tr>}
            {linhas.map((l) => (
              <tr key={l.nome} className="border-t border-line">
                <td className="p-3">{l.nome}</td>
                <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor)}</td>
                <td className="p-3 text-right font-mono-num text-muted">{l.qtd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function DashboardAcessoriosPage() {
  return (
    <AppShell>
      <ConteudoAcessorios />
    </AppShell>
  );
}
