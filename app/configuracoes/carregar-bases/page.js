"use client";
import { useEffect, useState } from "react";
import { UploadCloud, ShieldAlert, Building2, History } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { classifyDesc, categoria, normKey, parseBRDate, parseValorFlexivel, findExact, findAny } from "../../../lib/classificacao";
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

  useEffect(() => {
    (async () => setPerfil(await getPerfilAtual()))();
    const ativa = getUnidadeAtiva();
    setUnidadeAtivaState(ativa);
    carregarUltimoProcessamento(ativa);
  }, []);

  async function carregarUltimoProcessamento(ativa) {
    let query = supabase
      .from("pecas_processamentos")
      .select("processado_em, arquivo_pecas, arquivo_gspn, total_registros, gspn_data_solicitacao_max, usuario:perfis!pecas_processamentos_usuario_id_fkey(nome)")
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

      // um único "agora" pra esse processamento inteiro — usado como data da última
      // alteração real de cada registro que for criado ou modificado agora.
      const agoraIso = new Date().toISOString();

      // mapa ascCod -> unidade cadastrada (pra resolver o id da unidade ativa)
      const { data: todasUnidades } = await supabase.from("unidades").select("id, nome, asc_cod");
      const unidadePorAscCod = new Map((todasUnidades || []).map((u) => [u.asc_cod, u]));

      // precoMap é chaveado por código + código da unidade ativa (todas as linhas
      // deste upload ficam sob o mesmo ascCod — o da unidade em que você está)
      let precoMap = new Map(); // chave: codigo||ascCod -> { valor, ts, dataNF, ascCod }
      let lotes = [];
      let gspnDataSolicitacaoMax = null; // texto dd/mm/aaaa mais recente encontrado na coluna Q da Base GSPN
      let gspnDataSolicitacaoMaxTs = null;
      let duplicadosRemovidos = 0;
      let semEntrega = 0;

      // ---------- Base Peças (opcional) ----------
      if (arquivoPecas) {
        setProgresso({ pct: 5, texto: "Lendo Base Peças..." });
        await sleep(0);
        const pecasRows = await lerPlanilha(arquivoPecas);
        const pHeaders = pecasRows[0].map(normKey);

        const idxDataNF = findExact(pHeaders, "data nf");
        const idxPecasEnv = findExact(pHeaders, "pecas enviadas");
        const idxQtd = findAny(pHeaders, ["qtd", "qtde"]);
        const idxValor = findExact(pHeaders, "valor");
        const idxBilling = findExact(pHeaders, "nro. billing");
        const idxDocConta = findExact(pHeaders, "documento de conta");
        const idxItemNro = findExact(pHeaders, "item nro.");
        const idxArrived = findExact(pHeaders, "arrived date");
        const idxEntrega = findExact(pHeaders, "no. da entrega");

        const faltando = [];
        if (idxDataNF < 0) faltando.push("Data NF");
        if (idxPecasEnv < 0) faltando.push("Peças enviadas");
        if (idxQtd < 0) faltando.push("Qtd (ou Qtde)");
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
          // Toda linha da Base Peças fica atribuída à unidade em que o upload foi feito
          // (a unidade ativa), nunca à unidade indicada na própria planilha — cada
          // unidade só enxerga a Delivery/preço que ELA MESMA subiu, pra não misturar
          // custo/estoque de uma unidade com o de outra.
          const ascCodLinha = unidadeAtiva.asc_cod;
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
              ascCod: ascCodLinha,
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

        setProgresso({ pct: 25, texto: "Calculando valor unitário mais recente por código e por unidade..." });
        await sleep(0);
        for (const p of pecasDedup) {
          if (!p.qtd || !p.valor) continue;
          const chave = p.codigo + "||" + p.ascCod;
          const ts = parseBRDate(p.dataNF);
          const atual = precoMap.get(chave);
          if (!atual || (ts !== null && (atual.ts === null || ts > atual.ts))) {
            precoMap.set(chave, { valor: p.valor / p.qtd, ts, dataNF: p.dataNF, codigo: p.codigo, ascCod: p.ascCod });
          }
        }

        setProgresso({ pct: 32, texto: "Montando lotes por Delivery (custo exato por remessa)..." });
        await sleep(0);
        const lotesMap = new Map();
        for (const p of pecasDedup) {
          if (!p.qtd || !p.valor) continue;
          if (!p.entrega) { semEntrega++; continue; }
          const unidadeResolvida = unidadePorAscCod.get(p.ascCod);
          const chave = `${p.codigo}||${p.ascCod}||${p.entrega}`;
          lotesMap.set(chave, {
            unidade_id: unidadeResolvida ? unidadeResolvida.id : null,
            asc_cod_origem: p.ascCod,
            codigo: p.codigo,
            no_entrega: p.entrega,
            valor_unitario: Math.round((p.valor / p.qtd) * 100) / 100,
            qtd: p.qtd,
            data_nf: p.dataNF
          });
        }
        lotes = Array.from(lotesMap.values());
      }

      // ---------- catálogo compartilhado (sempre precisa) ----------
      setProgresso({ pct: 40, texto: "Lendo catálogo e preços já cadastrados..." });
      await sleep(0);
      const existentesMap = new Map(); // modelo||codigo -> {...catálogo}
      const existentesPorCodigo = new Map(); // codigo -> [ {...catálogo} ]
      {
        const PAGINA = 1000;
        let cursor = 0;
        let lidos = 0;
        while (true) {
          const { data, error } = await supabase
            .from("pecas_catalogo")
            .select("id, modelo, codigo, categoria, descricao_resumida, descricao_peca, atualizado_em")
            .gt("id", cursor)
            .order("id", { ascending: true })
            .limit(PAGINA);
          if (error) throw new Error("Falha ao ler catálogo existente: " + error.message);
          if (!data || data.length === 0) break;
          for (const p of data) {
            const info = {
              modelo: p.modelo,
              categoria: p.categoria,
              descricao_resumida: p.descricao_resumida,
              descricao_peca: p.descricao_peca,
              atualizado_em: p.atualizado_em
            };
            existentesMap.set(p.modelo.toUpperCase() + "||" + p.codigo.toUpperCase(), info);
            const lista = existentesPorCodigo.get(p.codigo.toUpperCase()) || [];
            lista.push({ ...info, codigo: p.codigo.toUpperCase() });
            existentesPorCodigo.set(p.codigo.toUpperCase(), lista);
          }
          cursor = data[data.length - 1].id;
          lidos += data.length;
          setProgresso({ pct: 40, texto: `Lendo catálogo já cadastrado... ${lidos} registro(s)` });
          if (data.length < PAGINA) break;
        }
      }

      // preços já cadastrados de QUALQUER unidade (agora comparamos por código + código-da-unidade)
      const precosExistentes = new Map(); // codigo||ascCod -> { valor_unitario, ts, data_referencia }
      {
        const PAGINA = 1000;
        let cursor = 0;
        let lidos = 0;
        while (true) {
          const { data, error } = await supabase
            .from("pecas_precos")
            .select("id, codigo, valor_unitario, data_referencia, asc_cod_origem, atualizado_em")
            .gt("id", cursor)
            .order("id", { ascending: true })
            .limit(PAGINA);
          if (error) throw new Error("Falha ao ler preços existentes: " + error.message);
          if (!data || data.length === 0) break;
          for (const p of data) {
            precosExistentes.set(p.codigo.toUpperCase() + "||" + p.asc_cod_origem, {
              valor_unitario: p.valor_unitario,
              ts: parseBRDate(p.data_referencia),
              data_referencia: p.data_referencia,
              atualizado_em: p.atualizado_em
            });
          }
          cursor = data[data.length - 1].id;
          lidos += data.length;
          setProgresso({ pct: 40, texto: `Lendo preços já cadastrados... ${lidos} registro(s)` });
          if (data.length < PAGINA) break;
        }
      }

      // lotes já cadastrados (por unidade + código + nº de Delivery) — usado pra nunca
      // regredir a data de um lote se a mesma Delivery aparecer de novo numa base
      // reprocessada com uma data mais antiga.
      const lotesExistentes = new Map(); // ascCod||codigo||entrega -> { data_nf, ts }
      if (arquivoPecas && lotes.length > 0) {
        const PAGINA = 1000;
        let cursor = 0;
        let lidos = 0;
        while (true) {
          const { data, error } = await supabase
            .from("lotes_pecas")
            .select("id, asc_cod_origem, codigo, no_entrega, data_nf")
            .gt("id", cursor)
            .order("id", { ascending: true })
            .limit(PAGINA);
          if (error) throw new Error("Falha ao ler lotes existentes: " + error.message);
          if (!data || data.length === 0) break;
          for (const l of data) {
            lotesExistentes.set(`${l.codigo}||${l.asc_cod_origem}||${l.no_entrega}`, {
              data_nf: l.data_nf,
              ts: parseBRDate(l.data_nf)
            });
          }
          cursor = data[data.length - 1].id;
          lidos += data.length;
          setProgresso({ pct: 40, texto: `Lendo lotes já cadastrados... ${lidos} registro(s)` });
          if (data.length < PAGINA) break;
        }
      }

      let registrosCatalogo = [];
      let registrosPrecos = [];
      let modelosSet = new Set();
      let naoClassificados = 0, semCusto = 0, precosAtualizados = 0, precosMantidos = 0, novasPecas = 0, catalogoAtualizados = 0;
      let precosSemCatalogo = 0;
      let lotesAtualizados = 0, lotesMantidos = 0;

      function decidirPreco(chave, precoNovo) {
        const existente = precosExistentes.get(chave);
        if (!precoNovo) {
          return existente
            ? { valor: existente.valor_unitario, data: existente.data_referencia, atualizadoEm: existente.atualizado_em, mudou: false }
            : { valor: null, data: null, atualizadoEm: agoraIso, mudou: false };
        }
        const existeSemData = !existente || existente.valor_unitario === null || existente.valor_unitario === undefined;
        const novoEhMaisRecente = precoNovo.ts !== null && (!existente?.ts || precoNovo.ts > existente.ts);
        if (existeSemData || novoEhMaisRecente) {
          if (existente) precosAtualizados++;
          // registra a data mais atual encontrada (data NF do lote comprado) e marca
          // agora como o momento da última alteração real desse preço.
          return { valor: Math.round(precoNovo.valor * 100) / 100, data: precoNovo.dataNF, atualizadoEm: agoraIso, mudou: true };
        }
        if (existente) precosMantidos++;
        // não mudou: preserva a data de última alteração que já estava gravada.
        return { valor: existente.valor_unitario, data: existente.data_referencia, atualizadoEm: existente.atualizado_em || agoraIso, mudou: false };
      }

      if (arquivoGspn) {
        // ---------- modo completo: classifica pelo GSPN (catálogo compartilhado) ----------
        setProgresso({ pct: 50, texto: "Lendo Base GSPN..." });
        await sleep(0);
        const gspnRows = await lerPlanilha(arquivoGspn);
        const gHeaders = gspnRows[0].map(normKey);

        const idxModelo = findExact(gHeaders, "modelo");
        const idxBH = findExact(gHeaders, "service product description");
        if (idxModelo < 0 || idxBH < 0) {
          throw new Error("Colunas Modelo e/ou Service Product Description não encontradas na Base GSPN.");
        }
        // coluna Q — data em que aquela solicitação/BH foi feita. Identifica até quando
        // o conteúdo dessa Base GSPN está atualizado. Não é obrigatória: se a coluna não
        // for encontrada, o processamento continua normalmente, só sem esse dado.
        const idxDataSolicitacao = findExact(gHeaders, "data da solicitacao");
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
          if (idxDataSolicitacao >= 0) {
            const solicitacaoStr = String(grow[idxDataSolicitacao] || "").trim();
            const solicitacaoTs = parseBRDate(solicitacaoStr);
            if (solicitacaoTs !== null && (gspnDataSolicitacaoMaxTs === null || solicitacaoTs > gspnDataSolicitacaoMaxTs)) {
              gspnDataSolicitacaoMaxTs = solicitacaoTs;
              gspnDataSolicitacaoMax = solicitacaoStr;
            }
          }
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
            const descPecaTrim = descPeca ? String(descPeca).trim() : "";
            const catalogoMudou = !existenteCatalogo
              || existenteCatalogo.categoria !== cat
              || existenteCatalogo.descricao_resumida !== resumida
              || (existenteCatalogo.descricao_peca || "") !== descPecaTrim;
            if (!existenteCatalogo) novasPecas++;
            else if (catalogoMudou) catalogoAtualizados++;

            uniqueCatalogo.set(uKey, {
              modelo,
              categoria: cat,
              codigo: codigoUpper,
              descricao_resumida: resumida,
              descricao_peca: descPecaTrim,
              // só atualiza a data de "última alteração" quando o dado realmente mudou;
              // se subir a mesma base de novo sem mudança, preserva a data original.
              atualizado_em: catalogoMudou ? agoraIso : (existenteCatalogo?.atualizado_em || agoraIso)
            });

            // cruza o preço só da unidade ativa (o que "sobrar" de outras unidades já foi
            // gravado direto no bloco abaixo, sem depender do GSPN)
            const chaveLocal = codigoUpper + "||" + unidadeAtiva.asc_cod;
            if (!uniquePrecos.has(chaveLocal)) {
              const precoNovo = precoMap.get(chaveLocal);
              const decisao = decidirPreco(chaveLocal, precoNovo);
              if (decisao.valor === null || decisao.valor === undefined) semCusto++;
              uniquePrecos.set(chaveLocal, {
                unidade_id: unidadeAtiva.id,
                asc_cod_origem: unidadeAtiva.asc_cod,
                codigo: codigoUpper,
                valor_unitario: decisao.valor,
                data_referencia: decisao.data,
                atualizado_em: decisao.atualizadoEm
              });
            }
          }
        }
        registrosCatalogo = Array.from(uniqueCatalogo.values());
        registrosPrecos = Array.from(uniquePrecos.values());
      } else {
        // ---------- modo só-preço: atualiza (ou registra) o custo de cada peça
        // encontrada na Base Peças, mesmo que o código ainda não esteja no catálogo
        // (ainda não apareceu em nenhuma Base GSPN). Ela já fica vendável e
        // consultável como "Não Classificado" (ver buscar_pecas()); quando o modelo
        // chegar depois por uma Base GSPN, o preço já gravado aqui é reaproveitado
        // automaticamente pra ela.
        setProgresso({ pct: 65, texto: "Atualizando preços das peças..." });
        await sleep(0);
        for (const [chave, precoInfo] of precoMap.entries()) {
          const decisao = decidirPreco(chave, precoInfo);
          if (decisao.mudou) {
            const unidadeResolvida = unidadePorAscCod.get(precoInfo.ascCod);
            if (!existentesPorCodigo.has(precoInfo.codigo)) precosSemCatalogo++;
            registrosPrecos.push({
              unidade_id: unidadeResolvida ? unidadeResolvida.id : null,
              asc_cod_origem: precoInfo.ascCod,
              codigo: precoInfo.codigo,
              valor_unitario: decisao.valor,
              data_referencia: decisao.data,
              atualizado_em: decisao.atualizadoEm
            });
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
        setProgresso({ pct: 85, texto: "Gravando preços..." });
        await sleep(0);
        const LOTE = 500;
        for (let i = 0; i < registrosPrecos.length; i += LOTE) {
          const lote = registrosPrecos.slice(i, i + LOTE);
          const { error: upError } = await supabase.from("pecas_precos").upsert(lote, { onConflict: "asc_cod_origem,codigo" });
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
        sem_custo: semCusto,
        gspn_data_solicitacao_max: gspnDataSolicitacaoMax
      });
      carregarUltimoProcessamento(unidadeAtiva);

      // nunca regride a data de um lote já gravado: se a mesma Delivery aparecer de
      // novo numa base com data igual ou mais antiga que a que já está no banco, mantém
      // o que já estava (só grava se for registro novo ou com data mais recente).
      if (lotes.length > 0) {
        const lotesParaGravar = [];
        for (const l of lotes) {
          const chave = `${l.codigo}||${l.asc_cod_origem}||${l.no_entrega}`;
          const existente = lotesExistentes.get(chave);
          const tsNovo = parseBRDate(l.data_nf);
          const novoEhMaisRecente = !existente || (tsNovo !== null && (existente.ts === null || tsNovo >= existente.ts));
          if (novoEhMaisRecente) {
            lotesParaGravar.push(l);
            if (existente) lotesAtualizados++;
          } else {
            lotesMantidos++;
          }
        }
        lotes = lotesParaGravar;
      }

      if (lotes.length > 0) {
        setProgresso({ pct: 96, texto: "Salvando lotes por Delivery (sem apagar os antigos)..." });
        await sleep(0);
        const LOTE = 500;
        for (let i = 0; i < lotes.length; i += LOTE) {
          const bloco = lotes.slice(i, i + LOTE);
          const { error: upLotesError } = await supabase.from("lotes_pecas").upsert(bloco, { onConflict: "asc_cod_origem,codigo,no_entrega" });
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
        lotesAtualizados,
        lotesMantidos,
        semEntrega,
        novasPecas,
        catalogoAtualizados,
        precosAtualizados,
        precosMantidos,
        precosSemCatalogo,
        gspnDataSolicitacaoMax
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

  return (
    <AppShell titulo="Carregar Bases">
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
                {ultimoProcessamento.usuario?.nome ? <> por <b>{ultimoProcessamento.usuario.nome}</b></> : ""}
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
