"use client";
import { useEffect, useState } from "react";
import { UploadCloud, ShieldAlert, Building2, History, Bot, RefreshCw, AlertTriangle, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { processarBases } from "../../../lib/processarBases";
import { getUnidadeAtiva } from "../../../lib/unidade";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function lerPlanilha(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" }));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Falha ao ler o arquivo " + file.name));
    reader.readAsArrayBuffer(file);
  });
}

export default function CarregarBasesPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [unidadeAtiva, setUnidadeAtivaState] = useState(null);
  const [arquivoPecas, setArquivoPecas] = useState(null);
  const [arquivoGspn, setArquivoGspn] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [progresso, setProgresso] = useState({ pct: 0, texto: "" });
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [ultimoProcessamento, setUltimoProcessamento] = useState(undefined);
  // Atualização automática pelo robô do PC (03/11/2026)
  const [statusRobo, setStatusRobo] = useState(undefined); // undefined = carregando, null = unidade sem robô
  const [pedindo, setPedindo] = useState(false);
  const [erroRobo, setErroRobo] = useState("");
  const [mostrarManual, setMostrarManual] = useState(false);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    (async () => setPerfil(await getPerfilAtual()))();
    const ativa = getUnidadeAtiva();
    setUnidadeAtivaState(ativa);
    carregarUltimoProcessamento(ativa);
    carregarStatusRobo(ativa);
    // acompanha o robô sozinho: a cada 20 s relê o status
    const t = setInterval(() => { carregarStatusRobo(ativa); carregarUltimoProcessamento(ativa); setAgora(Date.now()); }, 20000);
    return () => clearInterval(t);
  }, []);

  async function carregarStatusRobo(ativa) {
    if (!ativa) { setStatusRobo(null); return; }
    const { data, error } = await supabase.from("bases_robo_status").select("*").eq("unidade_id", ativa.id).maybeSingle();
    if (error) { setStatusRobo(null); return; }
    setStatusRobo(data || null);
  }

  async function forcarAtualizacao() {
    if (!unidadeAtiva) return;
    setPedindo(true);
    setErroRobo("");
    const { error } = await supabase.rpc("solicitar_atualizacao_bases", { p_unidade_id: unidadeAtiva.id });
    setPedindo(false);
    if (error) { setErroRobo("Não foi possível pedir a atualização: " + error.message); return; }
    carregarStatusRobo(unidadeAtiva);
  }

  async function carregarUltimoProcessamento(ativa) {
    let query = supabase
      .from("pecas_processamentos")
      .select("*, usuario:perfis!pecas_processamentos_usuario_id_fkey(nome)")
      .order("processado_em", { ascending: false })
      .limit(1);
    if (ativa) query = query.eq("unidade_id", ativa.id);
    const { data } = await query.maybeSingle();
    setUltimoProcessamento(data || null);
  }

  function fecharPopupResultado() {
    setResultado(null);
    setArquivoPecas(null);
    setArquivoGspn(null);
    setConcluido(false);
    setProgresso({ pct: 0, texto: "" });
  }

  async function processar() {
    setErro("");
    setProcessando(true);
    try {
      if (!unidadeAtiva) throw new Error("Não identifiquei a unidade ativa. Recarregue a página e tente de novo.");
      setProgresso({ pct: 3, texto: "Lendo planilhas..." });
      const pecasRows = arquivoPecas ? await lerPlanilha(arquivoPecas) : null;
      const gspnRows = arquivoGspn ? await lerPlanilha(arquivoGspn) : null;
      const { data: { user } } = await supabase.auth.getUser();
      const res = await processarBases({
        supabase,
        unidadeAtiva,
        pecasRows,
        gspnRows,
        nomeArquivoPecas: arquivoPecas?.name || null,
        nomeArquivoGspn: arquivoGspn?.name || null,
        usuarioId: user?.id,
        onProgresso: setProgresso
      });
      carregarUltimoProcessamento(unidadeAtiva);
      setResultado(res);
      setConcluido(true);
    } catch (e) {
      setErro(e.message);
    }
    setProcessando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Carregar Bases"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Supervisor", "Estoque"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Carregar Bases">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor, Gerente, Supervisor e Estoque podem carregar e reprocessar as bases.</p>
        </div>
      </AppShell>
    );
  }

  const podeProcessar = (arquivoPecas || arquivoGspn) && !processando && !concluido && unidadeAtiva;

  // ---- status do robô ----
  const fmtDH = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");
  const temRobo = !!statusRobo;
  const ultimaVerif = statusRobo?.ultima_verificacao ? new Date(statusRobo.ultima_verificacao).getTime() : null;
  const roboSemContato = temRobo && (!ultimaVerif || agora - ultimaVerif > 2 * 60 * 60 * 1000);
  const pedidoPendente = temRobo && statusRobo.forcar_pedido_em && (!statusRobo.forcar_atendido_em || new Date(statusRobo.forcar_pedido_em) > new Date(statusRobo.forcar_atendido_em));
  const manualLiberado = !temRobo || perfil?.cargo === "Administrador";
  const manualVisivel = !temRobo || mostrarManual;

  return (
    <AppShell titulo="Carregar Bases">
      {statusRobo !== undefined && temRobo && (
        <div className="card p-6 max-w-2xl mb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Bot size={20} style={{ color: "var(--accent)" }} />
              <div>
                <p className="font-display font-semibold text-[15px]">Atualização automática das bases</p>
                <p className="text-xs text-muted">{unidadeAtiva?.nome} — não precisa mais carregar manualmente</p>
              </div>
            </div>
            <button className="btn-primary text-xs py-2 shrink-0" onClick={forcarAtualizacao} disabled={pedindo || pedidoPendente || statusRobo.em_processamento} title="Pede para o robô reprocessar agora, mesmo sem arquivo novo">
              <RefreshCw size={13} className={pedindo ? "animate-spin" : ""} />
              Forçar atualização
            </button>
          </div>

          <p className="text-sm text-muted mb-4">
            O robô do PC confere a cada 2 minutos as planilhas que o Robô GSPN salva no OneDrive (Base Peças e Base GSPN).
            Quando o arquivo consolidado muda, o sistema é atualizado sozinho — catálogo, preços e Deliveries.
            Use <b>Forçar atualização</b> só se notar que algo não atualizou.
          </p>

          {roboSemContato && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: "rgba(232,163,61,0.16)", color: "#B5771C" }}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                <b>Robô sem contato</b> desde {fmtDH(statusRobo.ultima_verificacao)}. Confira se o PC do robô está ligado, com o usuário logado e o OneDrive sincronizando.
                Enquanto isso, as bases não serão atualizadas.
              </span>
            </div>
          )}
          {statusRobo.em_processamento && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <Loader2 size={15} className="animate-spin" /> Atualizando agora (desde {fmtDH(statusRobo.processamento_inicio)})...
            </div>
          )}
          {pedidoPendente && !statusRobo.em_processamento && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg text-sm" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              <Loader2 size={15} className="animate-spin" /> Atualização solicitada por {statusRobo.forcar_pedido_por_nome || "—"} em {fmtDH(statusRobo.forcar_pedido_em)} — aguardando o robô (até 2 minutos).
            </div>
          )}
          {statusRobo.ultimo_erro && (
            <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-lg text-sm bg-danger-soft text-danger">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>Última tentativa falhou em {fmtDH(statusRobo.ultimo_erro_em)}: {statusRobo.ultimo_erro}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            {[
              { nome: "Base Peças", salvo: statusRobo.pecas_salvo_em, proc: statusRobo.pecas_processado_em, total: statusRobo.pecas_total, rot: "linhas" },
              { nome: "Base GSPN", salvo: statusRobo.gspn_salvo_em, proc: statusRobo.gspn_processado_em, total: statusRobo.gspn_total, rot: "ordens de serviço" }
            ].map((b) => (
              <div key={b.nome} className="rounded-lg border border-line p-3">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  {b.proc ? <CheckCircle2 size={14} style={{ color: "var(--success)" }} /> : <AlertTriangle size={14} style={{ color: "#B5771C" }} />}
                  {b.nome}
                </p>
                <p className="text-xs text-muted">Arquivo consolidado salvo em</p>
                <p className="text-sm font-mono mb-1.5">{fmtDH(b.salvo)}</p>
                <p className="text-xs text-muted">Sistema atualizado em</p>
                <p className="text-sm font-mono font-semibold" style={{ color: "#2C7C6E" }}>{fmtDH(b.proc)}</p>
                {b.total ? <p className="text-[11px] text-muted mt-1">{Number(b.total).toLocaleString("pt-BR")} {b.rot}</p> : null}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted">Última verificação do robô: {fmtDH(statusRobo.ultima_verificacao)} · a tela se atualiza sozinha.</p>
          {erroRobo && <p className="text-sm text-danger mt-2">{erroRobo}</p>}

          {manualLiberado && (
            <button className="mt-4 text-xs text-muted hover:text-ink inline-flex items-center gap-1" onClick={() => setMostrarManual((v) => !v)}>
              <ChevronDown size={13} style={{ transform: mostrarManual ? "rotate(180deg)" : "none" }} />
              Carregar manualmente (contingência — só se o robô estiver parado)
            </button>
          )}
        </div>
      )}

      {manualVisivel && manualLiberado && (
      <div className="card p-6 max-w-2xl">
        {unidadeAtiva && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Building2 size={15} />
            <p className="text-sm">
              Você está em <b>{unidadeAtiva.nome}</b> (ASC COD. {unidadeAtiva.asc_cod}). Tudo que você subir aqui — preço e
              Delivery de cada peça — fica atribuído a <b>esta unidade</b>. Pra outra unidade ter suas próprias Deliveries e
              preços, alguém precisa subir a Base Peças estando naquela unidade. O catálogo (modelo/categoria/descrição) é o
              único dado sempre compartilhado entre todas as unidades.
            </p>
          </div>
        )}
        <p className="font-display font-semibold text-[15px] mb-1">Carregar bases de dados</p>
        <p className="text-sm text-muted mb-4">
          Suba as duas bases juntas pra um processamento completo, ou só uma de cada vez: só Base Peças já registra
          código, Delivery e custo de cada peça (sempre na unidade em que você está agora), mesmo pra peças que ainda
          não têm modelo — elas ficam disponíveis pra vender e consultar como "Não Classificado"; só Base GSPN atualiza
          a classificação/modelo (compartilhado, vale pra todas as unidades) e, quando encontra uma dessas peças, o
          modelo passa a aparecer com o custo que ela já tinha. Ao subir de novo, uma peça só é considerada "alterada"
          quando o dado realmente muda — se a data do registro (Data NF) for mais antiga do que a que já está gravada,
          o sistema mantém o que já tinha, pra sempre mostrar a data mais atual da peça comprada.
        </p>

        {ultimoProcessamento !== undefined && (
          <div className="flex items-center gap-2 mb-5 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(139,147,161,0.14)", color: "#5D6572" }}>
            <History size={14} className="shrink-0" />
            {ultimoProcessamento ? (
              <span>
                Última base processada {unidadeAtiva ? `nesta unidade` : ""} em{" "}
                <b>{new Date(ultimoProcessamento.processado_em).toLocaleString("pt-BR")}</b>
                {ultimoProcessamento.origem === "robo" ? <> pelo <b>robô automático</b></> : ultimoProcessamento.usuario?.nome ? <> por <b>{ultimoProcessamento.usuario.nome}</b></> : ""}
                {" "}({ultimoProcessamento.total_registros?.toLocaleString("pt-BR") ?? 0} registros).
                {ultimoProcessamento.gspn_data_solicitacao_max && (
                  <> A Base GSPN usada tem solicitações até <b>{ultimoProcessamento.gspn_data_solicitacao_max}</b>.</>
                )}
              </span>
            ) : (
              <span>Nenhuma base foi processada ainda nesta unidade.</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 mb-5">
          <label className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${arquivoPecas ? "border-success bg-canvas" : "border-line hover:border-brand-400"}`}>
            <p className="font-medium text-sm mb-1">Base Peças</p>
            <p className="text-xs text-muted mb-2">.xlsx — compras de peças</p>
            {arquivoPecas && <p className="text-xs font-mono text-success break-all">{arquivoPecas.name}</p>}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArquivoPecas(e.target.files[0])} />
          </label>
          <label className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition ${arquivoGspn ? "border-success bg-canvas" : "border-line hover:border-brand-400"}`}>
            <p className="font-medium text-sm mb-1">Base GSPN</p>
            <p className="text-xs text-muted mb-2">.xlsx — ordens de serviço</p>
            {arquivoGspn && <p className="text-xs font-mono text-success break-all">{arquivoGspn.name}</p>}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => setArquivoGspn(e.target.files[0])} />
          </label>
        </div>

        {(arquivoPecas || arquivoGspn) && !(arquivoPecas && arquivoGspn) && (
          <p className="text-xs mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            {arquivoPecas
              ? `Só Base Peças selecionada: vai atualizar (ou registrar) o custo de cada peça, sempre em ${unidadeAtiva?.nome || "sua unidade"} — mesmo peça sem modelo ainda fica registrada (código + Delivery + custo) e disponível como "Não Classificado" até a Base GSPN trazer o modelo dela.`
              : "Só Base GSPN selecionada: vai atualizar modelo/categoria/descrição no catálogo compartilhado (mantém os preços já cadastrados de todas as unidades)."}
          </p>
        )}

        <button
          className="btn-primary"
          disabled={!podeProcessar}
          onClick={() => setConfirmando(true)}
        >
          <UploadCloud size={16} />
          {processando ? "Processando..." : concluido ? "Base processada" : "Processar"}
        </button>

        {processando && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <p className="text-xs text-muted font-mono truncate">{progresso.texto}</p>
              <p className="text-xs font-mono font-bold shrink-0" style={{ color: "var(--accent)" }}>{progresso.pct}%</p>
            </div>
            <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
              <div className="h-full bg-brand-400 transition-all" style={{ width: progresso.pct + "%" }} />
            </div>
          </div>
        )}

        {erro && <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
      </div>
      )}

      <Modal
        open={confirmando}
        onClose={() => setConfirmando(false)}
        title="Processar base?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmando(false)}>Cancelar</button>
            <button
              className="btn-primary"
              onClick={() => { setConfirmando(false); processar(); }}
            >
              Sim, processar
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Isso vai atualizar (ou cadastrar) peças com base no(s) arquivo(s) selecionado(s). Preço e Delivery de cada peça
          da Base Peças ficam atribuídos a <b>{unidadeAtiva?.nome}</b> (a unidade em que você está agora).
          {" "}Essa mudança fica visível pra todo mundo que usa o sistema imediatamente.
        </p>
      </Modal>

      <Modal
        open={!!resultado}
        onClose={fecharPopupResultado}
        title="Base de peças atualizada com sucesso"
        footer={
          <button className="btn-primary" onClick={fecharPopupResultado}>
            Fechar
          </button>
        }
      >
        {resultado && (
          <div className="grid grid-cols-2 gap-3">
            <Stat n={resultado.totalRegistros} label="registros processados" />
            {resultado.modo === "completo" && <Stat n={resultado.totalModelos} label="modelos distintos" />}
            {resultado.modo !== "so-precos" && <Stat n={resultado.novasPecas} label="peças novas no catálogo" />}
            {resultado.modo !== "so-precos" && <Stat n={resultado.catalogoAtualizados} label="peças com classificação alterada" />}
            <Stat n={resultado.precosAtualizados} label="preços atualizados (mais recentes)" />
            <Stat n={resultado.precosMantidos} label="preços mantidos (já eram mais novos)" />
            {resultado.precosSemCatalogo > 0 && <Stat n={resultado.precosSemCatalogo} label="peças sem modelo ainda (Não Classificado)" />}
            {resultado.modo === "completo" && <Stat n={resultado.duplicadosRemovidos} label="duplicados removidos" />}
            {resultado.modo === "completo" && <Stat n={resultado.naoClassificados} label="não classificadas" />}
            {resultado.modo !== "so-precos" && <Stat n={resultado.semCusto} label="sem custo encontrado" />}
            {resultado.totalLotes > 0 && <Stat n={resultado.totalLotes} label="lotes por Delivery gravados" />}
            {resultado.lotesMantidos > 0 && <Stat n={resultado.lotesMantidos} label="lotes mantidos (data já era mais nova)" />}
            {resultado.semEntrega > 0 && <Stat n={resultado.semEntrega} label="compras sem nº de Delivery" />}
          </div>
        )}
        {resultado?.gspnDataSolicitacaoMax && (
          <p className="text-xs text-muted mt-3">
            Essa Base GSPN tem solicitações até <b className="text-ink">{resultado.gspnDataSolicitacaoMax}</b> — é até essa data que a classificação/modelo está atualizado.
          </p>
        )}
      </Modal>
    </AppShell>
  );
}

function Stat({ n, label }) {
  return (
    <div className="bg-canvas rounded-[10px] p-3.5">
      <div className="font-mono font-bold text-lg">{n?.toLocaleString("pt-BR")}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
