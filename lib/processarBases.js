// Processamento da Base Peças + Base GSPN (extraído da tela Carregar Bases em
// 03/11/2026) — o MESMO código é usado:
//   * pela tela Carregar Bases (upload manual de contingência, no navegador) e
//   * pelo robô do PC (robo-bases/robo.mjs, Node), que atualiza sozinho a
//     partir das planilhas que o Robô GSPN salva no OneDrive.
// Recebe as planilhas já lidas como matriz (linhas × colunas, 1ª linha =
// cabeçalho) e um cliente Supabase. Não depende de navegador.
import { classifyDesc, categoria, normKey, parseBRDate, parseValorFlexivel, findExact, findAny } from "./classificacao";

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function processarBases({
  supabase,
  unidadeAtiva,            // { id, asc_cod }
  pecasRows = null,        // matriz da Base Peças (ou null)
  gspnRows = null,         // matriz da Base GSPN (ou null)
  nomeArquivoPecas = null,
  nomeArquivoGspn = null,
  usuarioId = null,
  extrasProcessamento = null, // colunas extras gravadas em pecas_processamentos (ex.: origem do robô)
  gravarLotes = true,         // false = não grava Deliveries (o robô usa na 2ª passada)
  lotesSomenteNovos = false,  // true = só grava Delivery nova ou com data mais recente (robô: evita regravar 80 mil a cada volta)
  onProgresso = null
}) {
  const progresso = (p) => { if (onProgresso) onProgresso(p); };
    if (!unidadeAtiva) throw new Error("Não identifiquei a unidade ativa.");

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
    if (pecasRows && pecasRows.length) {
      progresso({ pct: 5, texto: "Lendo Base Peças..." });
      await sleep(0);
      const pHeaders = pecasRows[0].map(normKey);

      const idxDataNF = findExact(pHeaders, "data nf");
      const idxPecasEnv = findExact(pHeaders, "pecas enviadas");
      const idxQtd = findAny(pHeaders, ["qtd", "qtde"]);
      const idxValor = findExact(pHeaders, "valor");
      const idxBilling = findExact(pHeaders, "nro. billing");
      const idxDocConta = findExact(pHeaders, "documento de conta");
      const idxItemNro = findExact(pHeaders, "item nro.");
      const idxArrived = findExact(pHeaders, "arrived date");
      const idxEntrega = findAny(pHeaders, ["no. da entrega", "numero da entrega"]);

      const faltando = [];
      if (idxDataNF < 0) faltando.push("Data NF");
      if (idxPecasEnv < 0) faltando.push("Peças enviadas");
      if (idxQtd < 0) faltando.push("Qtd (ou Qtde)");
      if (idxValor < 0) faltando.push("Valor");
      if (faltando.length) {
        throw new Error(`Colunas não encontradas na Base Peças: ${faltando.join(", ")}`);
      }

      progresso({ pct: 15, texto: "Removendo duplicados da Base Peças..." });
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

      progresso({ pct: 25, texto: "Calculando valor unitário mais recente por código e por unidade..." });
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

      progresso({ pct: 32, texto: "Montando lotes por Delivery (custo exato por remessa)..." });
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
    progresso({ pct: 40, texto: "Lendo catálogo e preços já cadastrados..." });
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
        progresso({ pct: 40, texto: `Lendo catálogo já cadastrado... ${lidos} registro(s)` });
        if (data.length < PAGINA) break;
      }
    }

    // preços já cadastrados — só da unidade ativa: todo registro novo deste
    // upload sempre nasce com asc_cod_origem = unidadeAtiva.asc_cod, então
    // comparar com outras unidades é desnecessário (nunca dá match) e, pior,
    // força a RLS a varrer a tabela inteira checando vínculo de unidade
    // linha a linha — lento (e sujeito a timeout) pra quem não é
    // Administrador, já que só o Administrador tem um bypass direto na RLS.
    const precosExistentes = new Map(); // codigo||ascCod -> { valor_unitario, ts, data_referencia }
    {
      const PAGINA = 1000;
      let cursor = 0;
      let lidos = 0;
      while (true) {
        const { data, error } = await supabase
          .from("pecas_precos")
          .select("id, codigo, valor_unitario, data_referencia, asc_cod_origem, atualizado_em")
          .eq("asc_cod_origem", unidadeAtiva.asc_cod)
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
        progresso({ pct: 40, texto: `Lendo preços já cadastrados... ${lidos} registro(s)` });
        if (data.length < PAGINA) break;
      }
    }

    // lotes já cadastrados (por unidade + código + nº de Delivery) — usado pra nunca
    // regredir a data de um lote se a mesma Delivery aparecer de novo numa base
    // reprocessada com uma data mais antiga. Só da unidade ativa, pelo mesmo
    // motivo do bloco de preços acima (evita timeout de RLS pra quem não é
    // Administrador e nunca precisaria de dado de outra unidade mesmo).
    const lotesExistentes = new Map(); // ascCod||codigo||entrega -> { data_nf, ts }
    if (gravarLotes && pecasRows && pecasRows.length && lotes.length > 0) {
      const PAGINA = 1000;
      let cursor = 0;
      let lidos = 0;
      while (true) {
        const { data, error } = await supabase
          .from("lotes_pecas")
          .select("id, asc_cod_origem, codigo, no_entrega, data_nf")
          .eq("asc_cod_origem", unidadeAtiva.asc_cod)
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
        progresso({ pct: 40, texto: `Lendo lotes já cadastrados... ${lidos} registro(s)` });
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

    if (gspnRows && gspnRows.length) {
      // ---------- modo completo: classifica pelo GSPN (catálogo compartilhado) ----------
      progresso({ pct: 50, texto: "Lendo Base GSPN..." });
      await sleep(0);
      const gHeaders = gspnRows[0].map(normKey);

      const idxModelo = findExact(gHeaders, "modelo");
      const idxBH = findExact(gHeaders, "service product description");
      if (idxModelo < 0 || idxBH < 0) {
        throw new Error("Colunas Modelo e/ou Service Product Description não encontradas na Base GSPN.");
      }
      // coluna Q — data em que aquela solicitação/BH foi feita. Identifica até quando
      // o conteúdo dessa Base GSPN está atualizado. Não é obrigatória: se a coluna não
      // for encontrada, o processamento continua normalmente, só sem esse dado.
      const idxDataSolicitacao = findAny(gHeaders, ["data da solicitacao", "data de solicitacao"]);
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

      progresso({ pct: 65, texto: "Classificando peças e cruzando dados..." });
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
      progresso({ pct: 65, texto: "Atualizando preços das peças..." });
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
      progresso({ pct: 75, texto: "Gravando catálogo (compartilhado entre unidades)..." });
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
      progresso({ pct: 85, texto: "Gravando preços..." });
      await sleep(0);
      const LOTE = 500;
      for (let i = 0; i < registrosPrecos.length; i += LOTE) {
        const lote = registrosPrecos.slice(i, i + LOTE);
        const { error: upError } = await supabase.from("pecas_precos").upsert(lote, { onConflict: "asc_cod_origem,codigo" });
        if (upError) throw new Error("Falha ao gravar preços: " + upError.message);
        progresso({
          pct: 85 + Math.round((i / registrosPrecos.length) * 8),
          texto: `Gravando preços... ${Math.min(i + LOTE, registrosPrecos.length).toLocaleString("pt-BR")} / ${registrosPrecos.length.toLocaleString("pt-BR")}`
        });
        await sleep(0);
      }
    }

    await supabase.from("pecas_processamentos").insert({
      usuario_id: usuarioId || null,
      unidade_id: unidadeAtiva.id,
      arquivo_pecas: nomeArquivoPecas || null,
      arquivo_gspn: nomeArquivoGspn || null,
      total_registros: registrosCatalogo.length || registrosPrecos.length,
      duplicados_removidos: duplicadosRemovidos,
      nao_classificados: naoClassificados,
      sem_custo: semCusto,
      gspn_data_solicitacao_max: gspnDataSolicitacaoMax,
      ...(extrasProcessamento || {})
    });

    // nunca regride a data de um lote já gravado: se a mesma Delivery aparecer de
    // novo numa base com data igual ou mais antiga que a que já está no banco, mantém
    // o que já estava (só grava se for registro novo ou com data mais recente).
    if (lotes.length > 0) {
      const lotesParaGravar = [];
      for (const l of lotes) {
        const chave = `${l.codigo}||${l.asc_cod_origem}||${l.no_entrega}`;
        const existente = lotesExistentes.get(chave);
        const tsNovo = parseBRDate(l.data_nf);
        const novoEhMaisRecente = !existente || (tsNovo !== null && (existente.ts === null || (lotesSomenteNovos ? tsNovo > existente.ts : tsNovo >= existente.ts)));
        if (novoEhMaisRecente) {
          lotesParaGravar.push(l);
          if (existente) lotesAtualizados++;
        } else {
          lotesMantidos++;
        }
      }
      lotes = lotesParaGravar;
    }

    if (!gravarLotes) lotes = [];
    if (lotes.length > 0) {
      progresso({ pct: 96, texto: "Salvando lotes por Delivery (sem apagar os antigos)..." });
      await sleep(0);
      const LOTE = 500;
      for (let i = 0; i < lotes.length; i += LOTE) {
        const bloco = lotes.slice(i, i + LOTE);
        const { error: upLotesError } = await supabase.from("lotes_pecas").upsert(bloco, { onConflict: "asc_cod_origem,codigo,no_entrega" });
        if (upLotesError) throw new Error("Falha ao gravar lotes: " + upLotesError.message);
      }
    }

    progresso({ pct: 100, texto: "Concluído." });
    await sleep(150);

    return {
      modo: (gspnRows && gspnRows.length) ? ((pecasRows && pecasRows.length) ? "completo" : "so-gspn") : "so-precos",
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
    };
}
