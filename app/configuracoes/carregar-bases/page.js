"use client";
import { useEffect, useState } from "react";
import { UploadCloud, ShieldAlert, Building2 } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { classifyDesc, categoria, normKey, parseBRDate, parseValorFlexivel, findExact } from "../../../lib/classificacao";
import { getUnidadeAtiva, extrairAscCod } from "../../../lib/unidade";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";

// posição das colunas de ASC COD nos arquivos-padrão exportados (0-indexado)
const COL_ASC_COD_PECAS = 19; // coluna T
const COL_ASC_COD_GSPN = 3;   // coluna D

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

// confere se a planilha bate com a unidade ativa, olhando a coluna do ASC COD
// nas primeiras linhas com dado. Não bloqueia se a coluna não existir/estiver vazia
// (arquivo fora do padrão) — só bloqueia quando encontra um código DIFERENTE.
function conferirUnidade(rows, colIndex, unidadeAtiva, nomeArquivo) {
  for (let r = 1; r < Math.min(rows.length, 30); r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;
    const cod = extrairAscCod(row[colIndex]);
    if (!cod) continue;
    if (cod !== unidadeAtiva.asc_cod) {
      throw new Error(
        `${nomeArquivo} parece ser da unidade com ASC COD. ${cod}, mas você está na unidade ${unidadeAtiva.nome} (ASC COD. ${unidadeAtiva.asc_cod}). Confira se subiu o arquivo certo antes de processar.`
      );
    }
    return; // achou e bateu, não precisa checar mais linhas
  }
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

  useEffect(() => {
    (async () => setPerfil(await getPerfilAtual()))();
    setUnidadeAtivaState(getUnidadeAtiva());
  }, []);

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

      let precoMap = new Map();
      let lotes = [];
      let duplicadosRemovidos = 0;
      let semEntrega = 0;

      // ---------- Base Peças (opcional) ----------
      if (arquivoPecas) {
        setProgresso({ pct: 5, texto: "Lendo Base Peças..." });
        await sleep(0);
        const pecasRows = await lerPlanilha(arquivoPecas);
        const pHeaders = pecasRows[0].map(normKey);

        conferirUnidade(pecasRows, COL_ASC_COD_PECAS, unidadeAtiva, "Base Peças");

        const idxDataNF = findExact(pHeaders, "data nf");
        const idxPecasEnv = findExact(pHeaders, "pecas enviadas");
        const idxQtd = findExact(pHeaders, "qtd");
        const idxValor = findExact(pHeaders, "valor");
        const idxBilling = findExact(pHeaders, "nro. billing");
        const idxDocConta = findExact(pHeaders, "documento de conta");
        const idxItemNro = findExact(pHeaders, "item nro.");
        const idxArrived = findExact(pHeaders, "arrived date");
        const idxEntrega = findExact(pHeaders, "no. da entrega");

        const faltando = [];
        if (idxDataNF < 0) faltando.push("Data NF");
        if (idxPecasEnv < 0) faltando.push("Peças enviadas");
        if (idxQtd < 0) faltando.push("Qtd");
        if (idxValor < 0) faltando.push("Valor");
        if (faltando.length) {
          throw new Error(`Colunas não encontradas na Base Peças: ${faltando.join(", ")}`);
        }

        setProgresso({ pct: 15, texto: "Removendo duplicados da Base Peças..." });
        await sleep(0);
        const dedupMap = new Map();
        for (let r = 1; r < pecasRows.length; r++) {
          const row = pecasRows[r];
          if (!row || row.length === 0) continue;
          const code = String(row[idxPecasEnv] || "").trim();
          if (!code) continue;
          const key = [
            idxBilling >= 0 ? row[idxBilling] : "",
            idxDocConta >= 0 ? row[idxDocConta] : "",
            idxItemNro >= 0 ? row[idxItemNro] : "",
            code, row[idxQtd], row[idxValor]
          ].join("|");
          const completo = idxArrived >= 0
            ? (String(row[idxArrived] || "").trim() !== "-" && String(row[idxArrived] || "").trim() !== "")
            : false;
          const existente = dedupMap.get(key);
          if (!existente || (completo && !existente._completo)) {
            dedupMap.set(key, {
              codigo: code.toUpperCase(),
              qtd: parseValorFlexivel(row[idxQtd]) || 0,
              valor: parseValorFlexivel(row[idxValor]) || 0,
              dataNF: idxDataNF >= 0 ? row[idxDataNF] : "",
              entrega: idxEntrega >= 0 ? String(row[idxEntrega] || "").trim() : "",
              _completo: completo
            });
          }
        }
        const pecasDedup = Array.from(dedupMap.values());
        duplicadosRemovidos = (pecasRows.length - 1) - pecasDedup.length;

        setProgresso({ pct: 25, texto: "Calculando valor unitário mais recente por código..." });
        await sleep(0);
        for (const p of pecasDedup) {
          if (!p.qtd || !p.valor) continue;
          const ts = parseBRDate(p.dataNF);
          const atual = precoMap.get(p.codigo);
          if (!atual || (ts !== null && (atual.ts === null || ts > atual.ts))) {
            precoMap.set(p.codigo, { valor: p.valor / p.qtd, ts, dataNF: p.dataNF });
          }
        }

        setProgresso({ pct: 32, texto: "Montando lotes por Delivery (custo exato por remessa)..." });
        await sleep(0);
        const lotesMap = new Map();
        for (const p of pecasDedup) {
          if (!p.qtd || !p.valor) continue;
          if (!p.entrega) { semEntrega++; continue; }
          const chave = `${p.codigo}||${p.entrega}`;
          lotesMap.set(chave, {
            unidade_id: unidadeAtiva.id,
            codigo: p.codigo,
            no_entrega: p.entrega,
            valor_unitario: Math.round((p.valor / p.qtd) * 100) / 100,
            qtd: p.qtd,
            data_nf: p.dataNF
          });
        }
        lotes = Array.from(lotesMap.values());
      }

      // ---------- catálogo compartilhado + preços da unidade ativa (sempre precisa) ----------
      setProgresso({ pct: 40, texto: "Lendo catálogo e preços já cadastrados..." });
      await sleep(0);
      const existentesMap = new Map(); // modelo||codigo -> {...catálogo}
      const existentesPorCodigo = new Map(); // codigo -> [ {...catálogo} ]
      {
        const PAGINA = 1000;
        let inicio = 0;
        while (true) {
          const { data, error } = await supabase
            .from("pecas_catalogo")
            .select("modelo, codigo, categoria, descricao_resumida, descricao_peca")
            .range(inicio, inicio + PAGINA - 1);
          if (error) throw new Error("Falha ao ler catálogo existente: " + error.message);
          if (!data || data.length === 0) break;
          for (const p of data) {
            const info = {
              modelo: p.modelo,
              categoria: p.categoria,
              descricao_resumida: p.descricao_resumida,
              descricao_peca: p.descricao_peca
            };
            existentesMap.set(p.modelo.toUpperCase() + "||" + p.codigo.toUpperCase(), info);
            const lista = existentesPorCodigo.get(p.codigo.toUpperCase()) || [];
            lista.push({ ...info, codigo: p.codigo.toUpperCase() });
            existentesPorCodigo.set(p.codigo.toUpperCase(), lista);
          }
          if (data.length < PAGINA) break;
          inicio += PAGINA;
        }
      }

      const precosExistentes = new Map(); // codigo -> { valor_unitario, ts, data_referencia }
      {
        const PAGINA = 1000;
        let inicio = 0;
        while (true) {
          const { data, error } = await supabase
            .from("pecas_precos")
            .select("codigo, valor_unitario, data_referencia")
            .eq("unidade_id", unidadeAtiva.id)
            .range(inicio, inicio + PAGINA - 1);
          if (error) throw new Error("Falha ao ler preços existentes: " + error.message);
          if (!data || data.length === 0) break;
          for (const p of data) {
            precosExistentes.set(p.codigo.toUpperCase(), {
              valor_unitario: p.valor_unitario,
              ts: parseBRDate(p.data_referencia),
              data_referencia: p.data_referencia
            });
          }
          if (data.length < PAGINA) break;
          inicio += PAGINA;
        }
      }

      let registrosCatalogo = [];
      let registrosPrecos = [];
      let modelosSet = new Set();
      let naoClassificados = 0, semCusto = 0, precosAtualizados = 0, precosMantidos = 0, novasPecas = 0;

      function decidirPreco(codigo, precoNovo) {
        const existente = precosExistentes.get(codigo);
        if (!precoNovo) return existente ? { valor: existente.valor_unitario, data: existente.data_referencia, mudou: false } : { valor: null, data: null, mudou: false };
        const existeSemData = !existente || existente.valor_unitario === null || existente.valor_unitario === undefined;
        const novoEhMaisRecente = precoNovo.ts !== null && (!existente?.ts || precoNovo.ts > existente.ts);
        if (existeSemData || novoEhMaisRecente) {
          if (existente) precosAtualizados++;
          return { valor: Math.round(precoNovo.valor * 100) / 100, data: precoNovo.dataNF, mudou: true };
        }
        if (existente) precosMantidos++;
        return { valor: existente.valor_unitario, data: existente.data_referencia, mudou: false };
      }

      if (arquivoGspn) {
        // ---------- modo completo: classifica pelo GSPN (catálogo compartilhado), cruza preço da unidade ----------
        setProgresso({ pct: 50, texto: "Lendo Base GSPN..." });
        await sleep(0);
        const gspnRows = await lerPlanilha(arquivoGspn);
        const gHeaders = gspnRows[0].map(normKey);

        conferirUnidade(gspnRows, COL_ASC_COD_GSPN, unidadeAtiva, "Base GSPN");

        const idxModelo = findExact(gHeaders, "modelo");
        const idxBH = findExact(gHeaders, "service product description");
        if (idxModelo < 0 || idxBH < 0) {
          throw new Error("Colunas Modelo e/ou Service Product Description não encontradas na Base GSPN.");
        }
        const slots = [];
        for (let n = 1; n <= 10; n++) {
          const suf = n < 10 ? "0" + n : "10";
          const iCod = findExact(gHeaders, "codigo da peca" + suf);
          const iDesc = findExact(gHeaders, "pecas description " + suf);
          if (iCod >= 0 && iDesc >= 0) slots.push({ cod: iCod, desc: iDesc });
        }
        if (slots.length === 0) {
          throw new Error("Nenhuma coluna de peças (Código da peça01...10) encontrada na Base GSPN.");
        }

        setProgresso({ pct: 65, texto: "Classificando peças e cruzando dados..." });
        await sleep(0);
        const uniqueCatalogo = new Map();
        const uniquePrecos = new Map();

        for (let r = 1; r < gspnRows.length; r++) {
          const grow = gspnRows[r];
          if (!grow || grow.length === 0) continue;
          const modelo = String(grow[idxModelo] || "").trim();
          if (!modelo) continue;
          let cat = categoria(grow[idxBH]);
          if (modelo.toUpperCase().startsWith("DW")) cat = "WSM";
          if (modelo.toUpperCase().startsWith("NP") || modelo.toUpperCase().startsWith("XE")) cat = "NPC";
          modelosSet.add(modelo);
          for (const slot of slots) {
            const codigo = String(grow[slot.cod] || "").trim();
            if (!codigo) continue;
            const codigoUpper = codigo.toUpperCase();
            const descPeca = grow[slot.desc];
            const resumida = classifyDesc(descPeca);
            if (resumida === "Outros / Não Classificado") naoClassificados++;
            const uKey = modelo.toUpperCase() + "||" + codigoUpper;
            if (uniqueCatalogo.has(uKey)) continue;

            const existenteCatalogo = existentesMap.get(uKey);
            if (!existenteCatalogo) novasPecas++;

            uniqueCatalogo.set(uKey, {
              modelo,
              categoria: cat,
              codigo: codigoUpper,
              descricao_resumida: resumida,
              descricao_peca: descPeca ? String(descPeca).trim() : ""
            });

            if (!uniquePrecos.has(codigoUpper)) {
              const precoNovo = precoMap.get(codigoUpper);
              const decisao = decidirPreco(codigoUpper, precoNovo);
              if (decisao.valor === null || decisao.valor === undefined) semCusto++;
              uniquePrecos.set(codigoUpper, { unidade_id: unidadeAtiva.id, codigo: codigoUpper, valor_unitario: decisao.valor, data_referencia: decisao.data });
            }
          }
        }
        registrosCatalogo = Array.from(uniqueCatalogo.values());
        registrosPrecos = Array.from(uniquePrecos.values());
      } else {
        // ---------- modo só-preço: atualiza custo das peças já cadastradas, sem GSPN ----------
        setProgresso({ pct: 65, texto: "Atualizando preços das peças já cadastradas..." });
        await sleep(0);
        for (const [codigo, precoInfo] of precoMap.entries()) {
          const candidatos = existentesPorCodigo.get(codigo) || [];
          if (candidatos.length === 0) continue; // sem GSPN não sabemos o modelo, não cadastra peça nova
          const decisao = decidirPreco(codigo, precoInfo);
          if (decisao.mudou) {
            registrosPrecos.push({ unidade_id: unidadeAtiva.id, codigo, valor_unitario: decisao.valor, data_referencia: decisao.data });
          }
        }
      }

      if (registrosCatalogo.length > 0) {
        setProgresso({ pct: 75, texto: "Gravando catálogo (compartilhado entre unidades)..." });
        await sleep(0);
        const LOTE = 500;
        for (let i = 0; i < registrosCatalogo.length; i += LOTE) {
          const lote = registrosCatalogo.slice(i, i + LOTE);
          const { error: upError } = await supabase.from("pecas_catalogo").upsert(lote, { onConflict: "modelo,codigo" });
          if (upError) throw new Error("Falha ao gravar catálogo: " + upError.message);
          await sleep(0);
        }
      }

      if (registrosPrecos.length > 0) {
        setProgresso({ pct: 85, texto: `Gravando preços da unidade ${unidadeAtiva.nome}...` });
        await sleep(0);
        const LOTE = 500;
        for (let i = 0; i < registrosPrecos.length; i += LOTE) {
          const lote = registrosPrecos.slice(i, i + LOTE);
          const { error: upError } = await supabase.from("pecas_precos").upsert(lote, { onConflict: "unidade_id,codigo" });
          if (upError) throw new Error("Falha ao gravar preços: " + upError.message);
          setProgresso({
            pct: 85 + Math.round((i / registrosPrecos.length) * 8),
            texto: `Gravando preços... ${Math.min(i + LOTE, registrosPrecos.length).toLocaleString("pt-BR")} / ${registrosPrecos.length.toLocaleString("pt-BR")}`
          });
          await sleep(0);
        }
      }

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("pecas_processamentos").insert({
        usuario_id: user?.id,
        unidade_id: unidadeAtiva.id,
        arquivo_pecas: arquivoPecas?.name || null,
        arquivo_gspn: arquivoGspn?.name || null,
        total_registros: registrosCatalogo.length || registrosPrecos.length,
        duplicados_removidos: duplicadosRemovidos,
        nao_classificados: naoClassificados,
        sem_custo: semCusto
      });

      if (lotes.length > 0) {
        setProgresso({ pct: 96, texto: "Salvando lotes por Delivery (sem apagar os antigos)..." });
        await sleep(0);
        const LOTE = 500;
        for (let i = 0; i < lotes.length; i += LOTE) {
          const bloco = lotes.slice(i, i + LOTE);
          const { error: upLotesError } = await supabase.from("lotes_pecas").upsert(bloco, { onConflict: "unidade_id,codigo,no_entrega" });
          if (upLotesError) throw new Error("Falha ao gravar lotes: " + upLotesError.message);
        }
      }

      setProgresso({ pct: 100, texto: "Concluído." });
      await sleep(150);

      setResultado({
        modo: arquivoGspn ? (arquivoPecas ? "completo" : "so-gspn") : "so-precos",
        totalRegistros: registrosCatalogo.length || registrosPrecos.length,
        totalModelos: modelosSet.size,
        duplicadosRemovidos,
        naoClassificados,
        semCusto,
        totalLotes: lotes.length,
        semEntrega,
        novasPecas,
        precosAtualizados,
        precosMantidos
      });
      setConcluido(true);
    } catch (e) {
      setErro(e.message);
    }
    setProcessando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Carregar Bases"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && perfil.cargo !== "Administrador") {
    return (
      <AppShell titulo="Carregar Bases">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Administrador pode carregar e reprocessar as bases.</p>
        </div>
      </AppShell>
    );
  }

  const podeProcessar = (arquivoPecas || arquivoGspn) && !processando && !concluido && unidadeAtiva;

  return (
    <AppShell titulo="Carregar Bases">
      <div className="card p-6 max-w-2xl">
        {unidadeAtiva && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            <Building2 size={15} />
            <p className="text-sm">
              Subindo pra unidade <b>{unidadeAtiva.nome}</b> (ASC COD. {unidadeAtiva.asc_cod}). O catálogo de peças é compartilhado entre unidades — só o preço fica separado.
            </p>
          </div>
        )}
        <p className="font-display font-semibold text-[15px] mb-1">Carregar bases de dados</p>
        <p className="text-sm text-muted mb-5">
          Suba as duas bases juntas pra um processamento completo, ou só uma de cada vez: só Base Peças atualiza
          os custos das peças já cadastradas (na unidade ativa); só Base GSPN atualiza a classificação/modelo
          (compartilhado, vale pra todas as unidades).
        </p>

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
              ? "Só Base Peças selecionada: vai atualizar o custo das peças já cadastradas nesta unidade (não cadastra peça nova)."
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
            <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
              <div className="h-full bg-brand-400 transition-all" style={{ width: progresso.pct + "%" }} />
            </div>
            <p className="text-xs text-muted mt-2 font-mono">{progresso.texto}</p>
          </div>
        )}

        {erro && <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
      </div>

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
          Isso vai atualizar (ou cadastrar) peças com base no(s) arquivo(s) selecionado(s), pra unidade <b>{unidadeAtiva?.nome}</b>.
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
            <Stat n={resultado.precosAtualizados} label="preços atualizados (mais recentes)" />
            <Stat n={resultado.precosMantidos} label="preços mantidos (já eram mais novos)" />
            {resultado.modo === "completo" && <Stat n={resultado.duplicadosRemovidos} label="duplicados removidos" />}
            {resultado.modo === "completo" && <Stat n={resultado.naoClassificados} label="não classificadas" />}
            {resultado.modo !== "so-precos" && <Stat n={resultado.semCusto} label="sem custo encontrado" />}
            {resultado.totalLotes > 0 && <Stat n={resultado.totalLotes} label="lotes por Delivery gravados" />}
            {resultado.semEntrega > 0 && <Stat n={resultado.semEntrega} label="compras sem nº de Delivery" />}
          </div>
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
