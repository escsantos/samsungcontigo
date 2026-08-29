"use client";
import { useEffect, useState } from "react";
import {
  Database, ShieldAlert, Download, Trash2, AlertTriangle, RefreshCw, ClipboardList,
  Package, Users, Building2
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";

function fmtDataHora(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export default function ManutencaoPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [unidades, setUnidades] = useState([]);
  const [contagens, setContagens] = useState(null);
  const [carregandoContagens, setCarregandoContagens] = useState(true);
  const [compartilhado, setCompartilhado] = useState(null);

  const [exportandoSnapshot, setExportandoSnapshot] = useState(false);

  const [unidadeAlvo, setUnidadeAlvo] = useState("");
  const [contagemAlvo, setContagemAlvo] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [nomeDigitado, setNomeDigitado] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  const [confirmandoPecas, setConfirmandoPecas] = useState(false);
  const [fraseDigitada, setFraseDigitada] = useState("");
  const [excluindoPecas, setExcluindoPecas] = useState(false);

  const [logs, setLogs] = useState([]);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data: unis } = await supabase.from("unidades").select("*").order("nome");
      setUnidades(unis || []);
      await carregarContagens(unis || []);
      await carregarLogs();
    })();
  }, []);

  async function carregarContagens(unis) {
    setCarregandoContagens(true);

    // contagem "exact" nas tabelas grandes (catálogo/preços/lotes/processamentos) pode
    // estourar o timeout do Postgres — usa "estimated" (bem mais rápido, baseado no
    // planner) pros cards de totais gerais, já que aqui é só um número aproximado.
    const { count: totalCatalogo, error: errCatalogo } = await supabase.from("pecas_catalogo").select("*", { count: "estimated", head: true });
    const { count: totalUsuarios } = await supabase.from("perfis").select("*", { count: "exact", head: true });
    const { count: totalPrecos, error: errPrecos } = await supabase.from("pecas_precos").select("*", { count: "estimated", head: true });
    const { count: totalLotes, error: errLotes } = await supabase.from("lotes_pecas").select("*", { count: "estimated", head: true });
    const { count: totalProcessamentos, error: errProc } = await supabase.from("pecas_processamentos").select("*", { count: "estimated", head: true });
    if (errCatalogo || errPrecos || errLotes || errProc) {
      console.error("[contagens] falha ao contar tabela grande:", errCatalogo || errPrecos || errLotes || errProc);
    }
    setCompartilhado({
      catalogo: totalCatalogo || 0,
      usuarios: totalUsuarios || 0,
      precos: totalPrecos || 0,
      lotes: totalLotes || 0,
      processamentos: totalProcessamentos || 0
    });

    const porUnidade = {};
    for (const u of unis) {
      const { count: orcs } = await supabase.from("orcamentos").select("*", { count: "exact", head: true }).eq("unidade_id", u.id);
      const { count: itens } = await supabase
        .from("orcamento_itens")
        .select("*, orcamentos!inner(unidade_id)", { count: "exact", head: true })
        .eq("orcamentos.unidade_id", u.id);
      const { count: pagamentos } = await supabase
        .from("pagamentos_orcamento")
        .select("*, orcamentos!inner(unidade_id)", { count: "exact", head: true })
        .eq("orcamentos.unidade_id", u.id);
      const { count: precos } = await supabase.from("pecas_precos").select("*", { count: "exact", head: true }).eq("unidade_id", u.id);
      const { count: lotes } = await supabase.from("lotes_pecas").select("*", { count: "exact", head: true }).eq("unidade_id", u.id);

      const { data: vinculos } = await supabase.from("perfis_unidades").select("perfil_id").eq("unidade_id", u.id);
      const idsVendedores = (vinculos || []).map((v) => v.perfil_id);
      let clientes = 0;
      if (idsVendedores.length > 0) {
        const { count } = await supabase.from("clientes").select("*", { count: "exact", head: true }).in("vendedor_id", idsVendedores);
        clientes = count || 0;
      }

      porUnidade[u.id] = { orcamentos: orcs || 0, itens: itens || 0, pagamentos: pagamentos || 0, precos: precos || 0, lotes: lotes || 0, clientes };
    }
    setContagens(porUnidade);
    setCarregandoContagens(false);
  }

  async function carregarLogs() {
    const { data } = await supabase
      .from("manutencao_logs")
      .select("*, perfis(nome), unidades(nome)")
      .order("executado_em", { ascending: false })
      .limit(15);
    setLogs(data || []);
  }

  async function exportarSnapshotCompleto() {
    setExportandoSnapshot(true);
    const wb = XLSX.utils.book_new();

    const { data: orcs } = await supabase.from("orcamentos").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orcs || []), "Orcamentos");

    const { data: itens } = await supabase.from("orcamento_itens").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itens || []), "Itens");

    const { data: pags } = await supabase.from("pagamentos_orcamento").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pags || []), "Pagamentos");

    const { data: clientes } = await supabase.from("clientes").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientes || []), "Clientes");

    const { data: catalogo } = await supabase.from("pecas_catalogo").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catalogo || []), "Catalogo Pecas");

    const { data: precos } = await supabase.from("pecas_precos").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(precos || []), "Precos por Unidade");

    const { data: lotes } = await supabase.from("lotes_pecas").select("*");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lotes || []), "Lotes Delivery");

    XLSX.writeFile(wb, `snapshot-samsung-contigo-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setExportandoSnapshot(false);
  }

  async function abrirLimpeza(unidadeId) {
    setUnidadeAlvo(unidadeId);
    setNomeDigitado("");
    setErro("");
    const u = unidades.find((x) => String(x.id) === String(unidadeId));
    setContagemAlvo({ unidade: u, ...contagens[unidadeId] });
    setConfirmando(true);
  }

  const nomeConfere = !!contagemAlvo?.unidade?.nome && nomeDigitado.trim().toLowerCase() === contagemAlvo.unidade.nome.trim().toLowerCase();

  async function confirmarExclusao() {
    if (!contagemAlvo?.unidade) return;
    if (!nomeConfere) {
      setErro("O nome digitado não confere com o nome da unidade.");
      return;
    }
    setExcluindo(true);
    setErro("");
    try {
      const wb = XLSX.utils.book_new();
      const { data: orcs } = await supabase.from("orcamentos").select("*").eq("unidade_id", contagemAlvo.unidade.id);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(orcs || []), "Orcamentos");
      const idsOrc = (orcs || []).map((o) => o.id);
      if (idsOrc.length > 0) {
        const { data: itens } = await supabase.from("orcamento_itens").select("*").in("orcamento_id", idsOrc);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itens || []), "Itens");
        const { data: pags } = await supabase.from("pagamentos_orcamento").select("*").in("orcamento_id", idsOrc);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pags || []), "Pagamentos");
      }
      XLSX.writeFile(wb, `backup-antes-de-excluir-${contagemAlvo.unidade.nome}-${new Date().toISOString().slice(0, 10)}.xlsx`);

      // apaga em lotes pequenos, pra nunca estourar o tempo limite do banco em unidades com muitos pedidos
      let restantes = idsOrc.length;
      while (restantes > 0) {
        const { data: bloco } = await supabase.from("orcamentos").select("id").eq("unidade_id", contagemAlvo.unidade.id).limit(500);
        if (!bloco || bloco.length === 0) break;
        const { error: errDelete } = await supabase.from("orcamentos").delete().in("id", bloco.map((o) => o.id));
        if (errDelete) throw new Error(errDelete.message);
        restantes -= bloco.length;
        setErro("");
      }

      await supabase.from("unidades").update({ proximo_numero_pedido: 1 }).eq("id", contagemAlvo.unidade.id);

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("manutencao_logs").insert({
        acao: "limpeza_orcamentos",
        unidade_id: contagemAlvo.unidade.id,
        executado_por: user.id,
        detalhes: { orcamentos_excluidos: idsOrc.length }
      });

      setConfirmando(false);
      setSucesso(`Dados de "${contagemAlvo.unidade.nome}" apagados — ${idsOrc.length} pedido(s) excluído(s). Backup baixado automaticamente.`);
      await carregarContagens(unidades);
      await carregarLogs();
    } catch (e) {
      setErro("Falha ao excluir: " + e.message);
    }
    setExcluindo(false);
  }

  const FRASE_CONFIRMACAO = "LIMPAR PEÇAS";
  const fraseConfere = fraseDigitada.trim().toUpperCase() === FRASE_CONFIRMACAO;
  const [progressoExclusao, setProgressoExclusao] = useState("");

  // apaga uma tabela inteira em lotes pequenos, pra nunca estourar o tempo limite do banco
  async function excluirEmLotes(tabela, tamanhoLote, aoProgredir) {
    let total = 0;
    while (true) {
      const { data, error: errSelect } = await supabase.from(tabela).select("id").limit(tamanhoLote);
      if (errSelect) throw new Error(`Falha ao ler ${tabela}: ` + errSelect.message);
      if (!data || data.length === 0) break;
      const ids = data.map((r) => r.id);
      const { error: errDelete } = await supabase.from(tabela).delete().in("id", ids);
      if (errDelete) throw new Error(`Falha ao excluir ${tabela}: ` + errDelete.message);
      total += data.length;
      if (aoProgredir) aoProgredir(total);
      if (data.length < tamanhoLote) break;
    }
    return total;
  }

  async function confirmarLimpezaPecas() {
    if (!fraseConfere) {
      setErro("A frase digitada não confere.");
      return;
    }
    setExcluindoPecas(true);
    setErro("");
    setProgressoExclusao("Gerando backup...");
    try {
      const wb = XLSX.utils.book_new();
      const { data: catalogo } = await supabase.from("pecas_catalogo").select("*");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catalogo || []), "Catalogo Pecas");
      const { data: precos } = await supabase.from("pecas_precos").select("*");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(precos || []), "Precos");
      const { data: lotes } = await supabase.from("lotes_pecas").select("*");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lotes || []), "Lotes Delivery");
      XLSX.writeFile(wb, `backup-antes-de-limpar-pecas-${new Date().toISOString().slice(0, 10)}.xlsx`);

      const precosExcluidos = await excluirEmLotes("pecas_precos", 1000, (n) => setProgressoExclusao(`Excluindo preços... ${n.toLocaleString("pt-BR")}`));
      const lotesExcluidos = await excluirEmLotes("lotes_pecas", 1000, (n) => setProgressoExclusao(`Excluindo lotes por Delivery... ${n.toLocaleString("pt-BR")}`));
      await excluirEmLotes("pecas_processamentos", 1000, (n) => setProgressoExclusao(`Excluindo histórico de processamentos... ${n.toLocaleString("pt-BR")}`));
      const catalogoExcluido = await excluirEmLotes("pecas_catalogo", 1000, (n) => setProgressoExclusao(`Excluindo catálogo... ${n.toLocaleString("pt-BR")}`));

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("manutencao_logs").insert({
        acao: "limpeza_pecas_gspn",
        unidade_id: null,
        executado_por: user.id,
        detalhes: {
          catalogo_excluido: catalogoExcluido,
          precos_excluidos: precosExcluidos,
          lotes_excluidos: lotesExcluidos
        }
      });

      setConfirmandoPecas(false);
      setFraseDigitada("");
      setProgressoExclusao("");
      setSucesso(`Catálogo de peças zerado — ${catalogoExcluido} peça(s), ${precosExcluidos} preço(s) e ${lotesExcluidos} lote(s) excluídos. Backup baixado automaticamente. Já pode subir as bases novas.`);
      await carregarContagens(unidades);
      await carregarLogs();
    } catch (e) {
      setErro("Falha ao limpar: " + e.message);
    }
    setExcluindoPecas(false);
    setProgressoExclusao("");
  }

  if (perfil === undefined) {
    return <AppShell titulo="Manutenção"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && perfil.cargo !== "Administrador") {
    return (
      <AppShell titulo="Manutenção">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Administrador acessa a manutenção do banco de dados.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Manutenção do Banco de Dados">
      {sucesso && (
        <div className="mb-4 rounded-lg px-3 py-2.5 text-sm" style={{ background: "rgba(63,167,150,0.14)", color: "#2C7C6E" }}>
          {sucesso}
        </div>
      )}

      <div className="card p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-display font-semibold text-[15px] flex items-center gap-2">
            <Database size={17} style={{ color: "var(--accent)" }} />
            Contagem de registros
          </p>
          <button className="btn-secondary text-xs py-2" onClick={() => carregarContagens(unidades)} disabled={carregandoContagens}>
            <RefreshCw size={13} className={carregandoContagens ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>

        {carregandoContagens ? (
          <p className="text-sm text-muted">Contando registros...</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
              <div className="bg-canvas rounded-lg p-3.5">
                <div className="flex items-center gap-1.5 text-muted mb-1"><Package size={12} /><span className="text-[10.5px] uppercase font-mono">Catálogo (compartilhado)</span></div>
                <p className="font-mono font-bold text-lg">{compartilhado?.catalogo?.toLocaleString("pt-BR")}</p>
              </div>
              <div className="bg-canvas rounded-lg p-3.5">
                <div className="flex items-center gap-1.5 text-muted mb-1"><Package size={12} /><span className="text-[10.5px] uppercase font-mono">Preços (todas unidades)</span></div>
                <p className="font-mono font-bold text-lg">{compartilhado?.precos?.toLocaleString("pt-BR")}</p>
              </div>
              <div className="bg-canvas rounded-lg p-3.5">
                <div className="flex items-center gap-1.5 text-muted mb-1"><Package size={12} /><span className="text-[10.5px] uppercase font-mono">Lotes (todas unidades)</span></div>
                <p className="font-mono font-bold text-lg">{compartilhado?.lotes?.toLocaleString("pt-BR")}</p>
              </div>
              <div className="bg-canvas rounded-lg p-3.5">
                <div className="flex items-center gap-1.5 text-muted mb-1"><ClipboardList size={12} /><span className="text-[10.5px] uppercase font-mono">Processamentos</span></div>
                <p className="font-mono font-bold text-lg">{compartilhado?.processamentos?.toLocaleString("pt-BR")}</p>
              </div>
              <div className="bg-canvas rounded-lg p-3.5">
                <div className="flex items-center gap-1.5 text-muted mb-1"><Users size={12} /><span className="text-[10.5px] uppercase font-mono">Usuários (grupo)</span></div>
                <p className="font-mono font-bold text-lg">{compartilhado?.usuarios?.toLocaleString("pt-BR")}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <thead>
                  <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                    <th className="text-left px-3 py-2" style={{ width: "20%" }}>Unidade</th>
                    <th className="text-right px-3 py-2" style={{ width: "13%" }}>Orçamentos</th>
                    <th className="text-right px-3 py-2" style={{ width: "13%" }}>Itens</th>
                    <th className="text-right px-3 py-2" style={{ width: "13%" }}>Pagamentos</th>
                    <th className="text-right px-3 py-2" style={{ width: "13%" }}>Preços</th>
                    <th className="text-right px-3 py-2" style={{ width: "13%" }}>Lotes</th>
                    <th className="text-right px-3 py-2" style={{ width: "15%" }}>Clientes</th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.map((u) => (
                    <tr key={u.id} className="border-b border-line last:border-0">
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5"><Building2 size={12} className="text-muted" />{u.nome}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{contagens?.[u.id]?.orcamentos ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{contagens?.[u.id]?.itens ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{contagens?.[u.id]?.pagamentos ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{contagens?.[u.id]?.precos ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{contagens?.[u.id]?.lotes ?? "—"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{contagens?.[u.id]?.clientes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className="card p-6 mb-4">
        <p className="font-display font-semibold text-[15px] mb-1 flex items-center gap-2">
          <Download size={17} style={{ color: "var(--accent)" }} />
          Backup manual (snapshot)
        </p>
        <p className="text-sm text-muted mb-4">
          Baixa um Excel com todos os dados atuais do sistema (orçamentos, itens, pagamentos, clientes, catálogo de peças, preços por unidade, lotes por Delivery). Isso complementa, mas não substitui, o backup automático do próprio Supabase (Point-in-Time Recovery).
        </p>
        <button className="btn-primary" disabled={exportandoSnapshot} onClick={exportarSnapshotCompleto}>
          <Download size={16} />
          {exportandoSnapshot ? "Gerando..." : "Exportar snapshot completo"}
        </button>
      </div>

      <div className="card p-6 mb-4">
        <p className="font-display font-semibold text-[15px] mb-1 flex items-center gap-2">
          <Trash2 size={17} style={{ color: "var(--danger)" }} />
          Limpar orçamentos de uma unidade
        </p>
        <p className="text-sm text-muted mb-4">
          Apaga permanentemente todos os orçamentos (e itens/pagamentos vinculados) de uma unidade específica, e zera a numeração dela. Um backup é baixado automaticamente antes de excluir. <b>Ação irreversível.</b>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {unidades.map((u) => (
            <div key={u.id} className="border border-line rounded-xl p-4">
              <p className="font-medium text-sm mb-1 flex items-center gap-1.5"><Building2 size={14} className="text-muted" />{u.nome}</p>
              <p className="text-xs text-muted mb-3">{contagens?.[u.id]?.orcamentos ?? 0} orçamento(s) cadastrado(s)</p>
              <button
                className="btn-secondary text-xs py-2 w-full"
                style={{ color: "var(--danger)" }}
                disabled={!contagens?.[u.id]?.orcamentos}
                onClick={() => abrirLimpeza(u.id)}
              >
                <Trash2 size={13} />
                Limpar esta unidade
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6 mb-4">
        <p className="font-display font-semibold text-[15px] mb-1 flex items-center gap-2">
          <Trash2 size={17} style={{ color: "var(--danger)" }} />
          Limpar Catálogo e Preços de Peças
        </p>
        <p className="text-sm text-muted mb-1">
          Apaga permanentemente <b>todo</b> o catálogo de peças, preços (de todas as unidades), lotes por Delivery
          e histórico de processamentos — o banco de peças/GSPN volta a ficar vazio, pronto pra subir bases novas do zero.
        </p>
        <p className="text-xs text-muted mb-4">
          Isso <b>não afeta</b> orçamentos, clientes ou usuários — só o catálogo de peças e os preços. Um backup é baixado
          automaticamente antes de excluir. <b>Ação irreversível e afeta todas as unidades.</b>
        </p>
        <button
          className="btn-secondary text-xs py-2"
          style={{ color: "var(--danger)" }}
          disabled={!compartilhado?.catalogo && !compartilhado?.precos}
          onClick={() => { setFraseDigitada(""); setErro(""); setConfirmandoPecas(true); }}
        >
          <Trash2 size={13} />
          Limpar catálogo e preços de peças
        </button>
      </div>

      <div className="card p-6">
        <p className="font-display font-semibold text-[15px] mb-4 flex items-center gap-2">
          <ClipboardList size={17} style={{ color: "var(--accent)" }} />
          Histórico de manutenções
        </p>
        {logs.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma ação de manutenção registrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center justify-between text-sm border-b border-line last:border-0 pb-2 last:pb-0">
                <span>
                  {l.acao === "limpeza_pecas_gspn" ? (
                    <>
                      <b>{l.perfis?.nome || "—"}</b> zerou o catálogo de peças
                      {l.detalhes?.catalogo_excluido !== undefined && ` (${l.detalhes.catalogo_excluido} peça(s), ${l.detalhes.precos_excluidos} preço(s), ${l.detalhes.lotes_excluidos} lote(s))`}
                    </>
                  ) : (
                    <>
                      <b>{l.perfis?.nome || "—"}</b> limpou os orçamentos de <b>{l.unidades?.nome || "—"}</b>
                      {l.detalhes?.orcamentos_excluidos !== undefined && ` (${l.detalhes.orcamentos_excluidos} pedido(s))`}
                    </>
                  )}
                </span>
                <span className="text-xs text-muted whitespace-nowrap ml-3">{fmtDataHora(l.executado_em)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title="Confirmar exclusão permanente"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
            <button
              className="btn-primary"
              style={{ background: "var(--danger)" }}
              disabled={excluindo || nomeConfere !== true}
              onClick={confirmarExclusao}
            >
              {excluindo ? "Excluindo..." : "Excluir permanentemente"}
            </button>
          </>
        }
      >
        {contagemAlvo && (
          <>
            <div className="rounded-lg px-3 py-2.5 text-sm mb-4 flex items-start gap-2" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Isso vai apagar <b>permanentemente</b> os dados abaixo de <b>{contagemAlvo.unidade?.nome}</b>. Não pode ser desfeito.</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-4 text-center">
              <div className="bg-canvas rounded-lg p-2.5">
                <p className="font-mono font-bold">{contagemAlvo.orcamentos}</p>
                <p className="text-[10.5px] text-muted">orçamentos</p>
              </div>
              <div className="bg-canvas rounded-lg p-2.5">
                <p className="font-mono font-bold">{contagemAlvo.itens}</p>
                <p className="text-[10.5px] text-muted">itens</p>
              </div>
              <div className="bg-canvas rounded-lg p-2.5">
                <p className="font-mono font-bold">{contagemAlvo.pagamentos}</p>
                <p className="text-[10.5px] text-muted">pagamentos</p>
              </div>
            </div>
            <p className="text-xs text-muted mb-3">
              Um backup em Excel será baixado automaticamente antes da exclusão. Pra confirmar, digite o nome exato da unidade: <b>{contagemAlvo.unidade?.nome}</b>
            </p>
            <div className="relative">
              <input
                className="field-input"
                style={{ borderColor: nomeDigitado ? (nomeConfere ? "#2C7C6E" : "var(--danger)") : undefined }}
                value={nomeDigitado}
                onChange={(e) => setNomeDigitado(e.target.value)}
                placeholder={contagemAlvo.unidade?.nome}
                autoComplete="off"
              />
              {nomeDigitado && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: nomeConfere ? "#2C7C6E" : "var(--danger)" }}>
                  {nomeConfere ? "✓ confere" : "não confere"}
                </span>
              )}
            </div>
            {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
          </>
        )}
      </Modal>

      <Modal
        open={confirmandoPecas}
        onClose={() => !excluindoPecas && setConfirmandoPecas(false)}
        title="Zerar catálogo de peças?"
        footer={
          <>
            <button className="btn-secondary" disabled={excluindoPecas} onClick={() => setConfirmandoPecas(false)}>Cancelar</button>
            <button
              className="btn-primary"
              style={{ background: "var(--danger)" }}
              disabled={excluindoPecas || !fraseConfere}
              onClick={confirmarLimpezaPecas}
            >
              {excluindoPecas ? "Excluindo..." : "Excluir permanentemente"}
            </button>
          </>
        }
      >
        <div className="rounded-lg px-3 py-2.5 text-sm mb-4 flex items-start gap-2" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span>Isso vai apagar <b>todo</b> o catálogo de peças e preços, de <b>todas as unidades</b>. Não pode ser desfeito.</span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4 text-center">
          <div className="bg-canvas rounded-lg p-2.5">
            <p className="font-mono font-bold">{compartilhado?.catalogo ?? 0}</p>
            <p className="text-[10.5px] text-muted">peças no catálogo</p>
          </div>
          <div className="bg-canvas rounded-lg p-2.5">
            <p className="font-mono font-bold">{compartilhado?.precos ?? 0}</p>
            <p className="text-[10.5px] text-muted">preços</p>
          </div>
          <div className="bg-canvas rounded-lg p-2.5">
            <p className="font-mono font-bold">{compartilhado?.lotes ?? 0}</p>
            <p className="text-[10.5px] text-muted">lotes</p>
          </div>
        </div>

        {excluindoPecas ? (
          <div className="text-center py-2">
            <RefreshCw size={18} className="animate-spin mx-auto mb-2" style={{ color: "var(--accent)" }} />
            <p className="text-sm font-mono">{progressoExclusao}</p>
            <p className="text-[11px] text-muted mt-1">Isso pode levar um tempo com muitos registros — não feche essa tela.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted mb-3">
              Um backup em Excel será baixado automaticamente antes da exclusão. Pra confirmar, digite: <b>{FRASE_CONFIRMACAO}</b>
            </p>
            <div className="relative">
              <input
                className="field-input"
                style={{ borderColor: fraseDigitada ? (fraseConfere ? "#2C7C6E" : "var(--danger)") : undefined }}
                value={fraseDigitada}
                onChange={(e) => setFraseDigitada(e.target.value)}
                placeholder={FRASE_CONFIRMACAO}
                autoComplete="off"
              />
              {fraseDigitada && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium" style={{ color: fraseConfere ? "#2C7C6E" : "var(--danger)" }}>
                  {fraseConfere ? "✓ confere" : "não confere"}
                </span>
              )}
            </div>
          </>
        )}
        {erro && <p className="text-xs text-danger mt-2">{erro}</p>}
      </Modal>
    </AppShell>
  );
}
