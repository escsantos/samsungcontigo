"use client";
import { useEffect, useState } from "react";
import { Wallet, CheckCircle2, Clock, Percent, Hash, Lock, Store, FileSpreadsheet, Printer } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import BotaoAtualizar from "../../../components/BotaoAtualizar";
import BotaoAcao3D from "../../../components/BotaoAcao3D";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS } from "../../../lib/permissions";
import { formatarMoedaSemSimbolo, formatarDataBR, mesReferenciaLabel } from "../../../lib/formato";
import { filtrarPorMarca } from "../../../lib/agregacaoValores";

function mesclarPorAtendenteUnidade(linhas) {
  const mapa = new Map();
  linhas.forEach((v) => {
    const chave = `${v.usuario_id}::${v.unidade_id}`;
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        usuario_id: v.usuario_id,
        nome_completo: v.nome_completo,
        unidade_id: v.unidade_id,
        unidade_nome: v.unidade_nome,
        linha: null,
        orcamento_aprovado: 0,
        valor_pago: 0,
        qtd_os: 0,
      });
    }
    const acc = mapa.get(chave);
    acc.orcamento_aprovado += Number(v.orcamento_aprovado);
    acc.valor_pago += Number(v.valor_pago);
    acc.qtd_os += Number(v.qtd_os);
  });
  return [...mapa.values()];
}

function inicioMes() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

const MEDALHA = ["text-gold", "text-prata", "text-bronze"];
const CARGOS_GESTAO = [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADM, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR];

const ABAS = [
  { id: "orcamentos", rotulo: "Orçamentos", view: "vw_dashboard_vendedores_ow", categoria: null },
  { id: "acessorios", rotulo: "Acessórios", view: "vw_dashboard_vendedores", categoria: "Acessório" },
];

function ConteudoVendedores() {
  const { usuario, unidades, linhaFiltro, marcasFiltro, detalharLinha } = useSessao();
  const [aba, setAba] = useState("orcamentos");
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [detalhe, setDetalhe] = useState(null);
  const [lancamentosDetalhe, setLancamentosDetalhe] = useState([]);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [unidadeFiltro, setUnidadeFiltro] = useState("");
  const [detalhesImpressao, setDetalhesImpressao] = useState(null);
  const [preparandoImpressao, setPreparandoImpressao] = useState(false);

  const idsAutorizados = new Set(unidades.map((u) => u.id));
  const abaAtual = ABAS.find((a) => a.id === aba);

  async function carregar() {
    setCarregando(true);
    let query = supabase.from(abaAtual.view).select("*");
    if (linhaFiltro) query = query.eq("linha", linhaFiltro);
    const { data } = await query;
    const base = filtrarPorMarca(linhaFiltro || detalharLinha ? data || [] : mesclarPorAtendenteUnidade(data || []), marcasFiltro);
    const lista = base
      .map((v) => ({ ...v, falta: Number(v.orcamento_aprovado) - Number(v.valor_pago), premio: Number(v.valor_pago) * 0.05 }))
      .filter((v) => Number(v.valor_pago) > 0 || Number(v.qtd_os) > 0)
      .sort((a, b) => Number(b.valor_pago) - Number(a.valor_pago));
    setLinhas(lista);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, [aba, linhaFiltro, marcasFiltro, detalharLinha]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapaUnidades = new Map();
  linhas.forEach((l) => mapaUnidades.set(l.unidade_id, l.unidade_nome));
  const unidadesDisponiveis = [...mapaUnidades.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const linhasFiltradas = unidadeFiltro ? linhas.filter((l) => l.unidade_id === unidadeFiltro) : linhas;

  const totalOrcamento = linhasFiltradas.reduce((s, l) => s + Number(l.orcamento_aprovado), 0);
  const totalPago = linhasFiltradas.reduce((s, l) => s + Number(l.valor_pago), 0);
  const totalFalta = linhasFiltradas.reduce((s, l) => s + l.falta, 0);
  const totalQtdOs = linhasFiltradas.reduce((s, l) => s + Number(l.qtd_os), 0);

  async function buscarDetalhesPorAtendente(linhasAlvo) {
    const linhasComPermissao = linhasAlvo.filter((l) => podeVerDetalhe(l));
    if (linhasComPermissao.length === 0) return new Map();

    const unidadeIds = [...new Set(linhasComPermissao.map((l) => l.unidade_id))];
    const atendenteIds = [...new Set(linhasComPermissao.map((l) => l.usuario_id))];

    let query = supabase
      .from("lancamentos")
      .select("id, data, numero_os, unidade_id, atendente_id, linha, valor_pago, tipos_servico(nome)")
      .in("unidade_id", unidadeIds)
      .in("atendente_id", atendenteIds)
      .gte("data", inicioMes())
      .order("data", { ascending: false });

    if (linhaFiltro) query = query.eq("linha", linhaFiltro);

    if (abaAtual.categoria) {
      const { data: cat } = await supabase.from("categorias").select("id").eq("nome", abaAtual.categoria).single();
      query = query.eq("categoria_id", cat?.id);
    } else {
      const { data: cat } = await supabase.from("categorias").select("id").eq("nome", "Acessório").single();
      if (cat) query = query.neq("categoria_id", cat.id);
    }

    const { data } = await query;
    const mapa = new Map();
    (data || []).forEach((l) => {
      const chave = `${l.atendente_id}::${l.unidade_id}::${linhaFiltro || (detalharLinha ? l.linha : "null")}`;
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(l);
    });
    return mapa;
  }

  async function exportarExcel() {
    const XLSX = await import("xlsx");
    const mapaDetalhes = await buscarDetalhesPorAtendente(linhasFiltradas);
    const linhasExport = [];

    linhasFiltradas.forEach((l, i) => {
      const resumo = {
        "Posição": i + 1,
        "Atendente": l.nome_completo,
        "Unidade": l.unidade_nome,
        "Data": "",
        "OS": "",
        "Tipo de serviço": "— RESUMO DO PERÍODO —",
        "Valor": Number(l.valor_pago),
      };
      if (abaAtual.categoria) resumo["Prêmio (5%)"] = Number(l.premio);
      resumo["Qtd. OS"] = Number(l.qtd_os);
      linhasExport.push(resumo);

      const detalhes = mapaDetalhes.get(`${l.usuario_id}::${l.unidade_id}::${l.linha}`) || [];
      detalhes.forEach((d) => {
        const linhaDetalhe = {
          "Posição": "",
          "Atendente": "",
          "Unidade": "",
          "Data": formatarDataBR(d.data),
          "OS": d.numero_os,
          "Tipo de serviço": d.tipos_servico?.nome || "",
          "Valor": Number(d.valor_pago),
        };
        if (abaAtual.categoria) linhaDetalhe["Prêmio (5%)"] = "";
        linhaDetalhe["Qtd. OS"] = "";
        linhasExport.push(linhaDetalhe);
      });
    });

    const planilha = XLSX.utils.json_to_sheet(linhasExport);
    const livro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(livro, planilha, "Vendedores");
    const sufixoUnidade = unidadeFiltro ? `-${(mapaUnidades.get(unidadeFiltro) || "unidade").replace(/\s+/g, "_")}` : "";
    XLSX.writeFile(livro, `vendedores-${abaAtual.id}${sufixoUnidade}-${mesReferenciaLabel(inicioMes()).replace(/\s+/g, "_")}.xlsx`);
  }

  async function imprimirTela() {
    setPreparandoImpressao(true);
    const mapaDetalhes = await buscarDetalhesPorAtendente(linhasFiltradas);
    setDetalhesImpressao(mapaDetalhes);
    setPreparandoImpressao(false);
    setTimeout(() => window.print(), 80);
  }

  function podeVerDetalhe(linha) {
    if (CARGOS_GESTAO.includes(usuario.cargo)) return idsAutorizados.has(linha.unidade_id);
    return linha.usuario_id === usuario.id;
  }

  async function abrirDetalhe(linha) {
    setDetalhe({ titulo: linha.nome_completo, unidadeId: linha.unidade_id, usuarioId: linha.usuario_id });
    if (!podeVerDetalhe(linha)) return;
    setCarregandoDetalhe(true);
    let query = supabase
      .from("lancamentos")
      .select("id, data, numero_os, orcamento_aprovado, valor_pago, tipos_servico(nome)")
      .eq("unidade_id", linha.unidade_id)
      .eq("atendente_id", linha.usuario_id)
      .gte("data", inicioMes())
      .order("data", { ascending: false });
    if (linha.linha) query = query.eq("linha", linha.linha);

    if (abaAtual.categoria) {
      const { data: cat } = await supabase.from("categorias").select("id").eq("nome", abaAtual.categoria).single();
      query = query.eq("categoria_id", cat?.id);
    } else {
      const { data: cat } = await supabase.from("categorias").select("id").eq("nome", "Acessório").single();
      if (cat) query = query.neq("categoria_id", cat.id);
    }

    const { data } = await query;
    setLancamentosDetalhe(data || []);
    setCarregandoDetalhe(false);
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Dashboard</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Vendedores de {mesReferenciaLabel(inicioMes())}</h1>
          <p className="text-sm text-muted mt-1">Ranking por atendente, de todas as unidades.</p>
        </div>
        <BotaoAtualizar aoAtualizar={carregar} className="shrink-0 print:hidden" />
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap print:hidden">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`px-4 py-1.5 rounded-full text-sm transition ${
              aba === a.id ? "bg-gold text-white font-medium" : "bg-white border border-line text-muted hover:border-gold/50"
            }`}
          >
            {a.rotulo}
          </button>
        ))}

        <div className="flex items-center gap-1.5 ml-1">
          <Store size={13} className="text-muted" />
          <select className="field-input py-1.5 text-sm w-48" value={unidadeFiltro} onChange={(e) => setUnidadeFiltro(e.target.value)}>
            <option value="">Todas as unidades</option>
            {unidadesDisponiveis.map((u) => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <BotaoAcao3D icone={FileSpreadsheet} rotulo="Exportar Excel" onClick={exportarExcel} cor="teal" disabled={linhasFiltradas.length === 0} />
          <BotaoAcao3D
            icone={Printer}
            rotulo={preparandoImpressao ? "Preparando…" : "Imprimir"}
            onClick={imprimirTela}
            cor="ink"
            disabled={preparandoImpressao}
          />
        </div>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#2670B5]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#2670B5]/10 flex items-center justify-center text-[#2670B5] mb-2"><Wallet size={16} /></div>
            <p className="text-xs text-muted mb-1">Orçamento aprovado</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalOrcamento)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#3F8A5C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#3F8A5C]/10 flex items-center justify-center text-[#3F8A5C] mb-2"><CheckCircle2 size={16} /></div>
            <p className="text-xs text-muted mb-1">Valor pago</p>
            <p className="font-mono-num text-xl font-semibold text-ink">R$ {formatarMoedaSemSimbolo(totalPago)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#9C5A34]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#9C5A34]/10 flex items-center justify-center text-[#9C5A34] mb-2"><Clock size={16} /></div>
            <p className="text-xs text-muted mb-1">Total a receber</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C5A34]">R$ {formatarMoedaSemSimbolo(totalFalta)}</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#C9A227]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#C9A227]/10 flex items-center justify-center text-[#9C7E13] mb-2"><Percent size={16} /></div>
            <p className="text-xs text-muted mb-1">% recebido</p>
            <p className="font-mono-num text-xl font-semibold text-[#9C7E13]">{totalOrcamento ? ((totalPago / totalOrcamento) * 100).toFixed(1) : "0.0"}%</p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="h-1.5 bg-[#7C819C]" />
          <div className="p-4">
            <div className="w-8 h-8 rounded-lg bg-[#7C819C]/10 flex items-center justify-center text-[#7C819C] mb-2"><Hash size={16} /></div>
            <p className="text-xs text-muted mb-1">Qtd. de OS</p>
            <p className="font-mono-num text-xl font-semibold text-ink">{totalQtdOs}</p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden print:hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Atendente</td>
              <td className="p-3">Unidade</td>
              <td className="p-3 text-right">Valor vendido</td>
              {abaAtual.categoria && <td className="p-3 text-right">Prêmio (5%)</td>}
              <td className="p-3 text-right">Qtd. OS</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={abaAtual.categoria ? 5 : 4}>Carregando…</td></tr>}
            {!carregando && linhasFiltradas.length === 0 && <tr><td className="p-4 text-muted" colSpan={abaAtual.categoria ? 5 : 4}>Nenhuma venda no período{unidadeFiltro ? " para essa unidade" : ""}.</td></tr>}
            {linhasFiltradas.map((l, i) => (
              <tr key={`${l.usuario_id}-${l.unidade_id}-${l.linha}`} className="border-t border-line hover:bg-canvas/60 cursor-pointer" onClick={() => abrirDetalhe(l)}>
                <td className="p-3">
                  <span className="inline-flex items-center gap-2">
                    <span className={`text-xs font-semibold w-6 ${MEDALHA[i] || "text-muted"}`}>{i + 1}º</span>
                    {l.nome_completo}
                    {!podeVerDetalhe(l) && <Lock size={12} className="text-muted" />}
                  </span>
                </td>
                <td className="p-3 text-muted">
                  {l.unidade_nome}{" "}
                  {l.linha === "ih" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">
                      IH
                    </span>
                  )}
                </td>
                <td className="p-3 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                {abaAtual.categoria && <td className="p-3 text-right font-mono-num text-gold">R$ {formatarMoedaSemSimbolo(l.premio)}</td>}
                <td className="p-3 text-right font-mono-num text-muted">{l.qtd_os}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hidden print:block card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Atendente / Data — OS — Tipo de serviço</td>
              <td className="p-3">Unidade</td>
              <td className="p-3 text-right">Valor</td>
              {abaAtual.categoria && <td className="p-3 text-right">Prêmio (5%)</td>}
              <td className="p-3 text-right">Qtd. OS</td>
            </tr>
          </thead>
          <tbody>
            {linhasFiltradas.flatMap((l, i) => {
              const chave = `${l.usuario_id}::${l.unidade_id}::${l.linha}`;
              const detalhes = detalhesImpressao?.get(chave) || [];
              const linhaResumo = (
                <tr key={`${chave}-resumo`} className="border-t border-line bg-canvas/60 font-semibold">
                  <td className="p-3">{i + 1}º {l.nome_completo}</td>
                  <td className="p-3 text-muted">
                    {l.unidade_nome} <span className="text-[9px]">({l.linha === "ih" ? "IH" : "CI"})</span>
                  </td>
                  <td className="p-3 text-right font-mono-num">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                  {abaAtual.categoria && <td className="p-3 text-right font-mono-num text-gold">R$ {formatarMoedaSemSimbolo(l.premio)}</td>}
                  <td className="p-3 text-right font-mono-num">{l.qtd_os}</td>
                </tr>
              );
              const linhasDetalhe = detalhes.map((d) => (
                <tr key={d.id} className="border-t border-line text-muted text-xs">
                  <td className="py-1.5 pl-8">{formatarDataBR(d.data)} — OS {d.numero_os} — {d.tipos_servico?.nome}</td>
                  <td></td>
                  <td className="text-right font-mono-num">R$ {formatarMoedaSemSimbolo(d.valor_pago)}</td>
                  {abaAtual.categoria && <td></td>}
                  <td></td>
                </tr>
              ));
              return [linhaResumo, ...linhasDetalhe];
            })}
          </tbody>
        </table>
      </div>

      {detalhe && (
        <Modal titulo={detalhe.titulo} subtitulo={`${lancamentosDetalhe.length} lançamento(s) — ${abaAtual.rotulo}`} onFechar={() => setDetalhe(null)} largura="max-w-3xl">
          {!podeVerDetalhe({ unidade_id: detalhe.unidadeId, usuario_id: detalhe.usuarioId }) ? (
            <div className="flex flex-col items-center text-center py-6 text-muted">
              <Lock size={22} className="mb-2 opacity-60" />
              <p className="text-sm">Você não tem permissão para ver o detalhe deste atendente.</p>
            </div>
          ) : carregandoDetalhe ? (
            <p className="text-sm text-muted py-6 text-center">Carregando…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
                  <td className="pb-2">Data</td>
                  <td className="pb-2">OS</td>
                  <td className="pb-2">Tipo de serviço</td>
                  <td className="pb-2 text-right">Valor pago</td>
                </tr>
              </thead>
              <tbody>
                {lancamentosDetalhe.map((l) => (
                  <tr key={l.id} className="border-t border-line">
                    <td className="py-2">{formatarDataBR(l.data)}</td>
                    <td className="py-2 font-mono-num">{l.numero_os}</td>
                    <td className="py-2">{l.tipos_servico?.nome}</td>
                    <td className="py-2 text-right font-mono-num font-medium">R$ {formatarMoedaSemSimbolo(l.valor_pago)}</td>
                  </tr>
                ))}
                {lancamentosDetalhe.length === 0 && (
                  <tr><td colSpan={4} className="py-4 text-muted text-center">Nenhum lançamento.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function DashboardVendedoresPage() {
  return (
    <AppShell>
      <ConteudoVendedores />
    </AppShell>
  );
}
