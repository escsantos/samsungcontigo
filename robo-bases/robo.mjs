// =====================================================================
// Robô de Bases — Sistema Consulta de Peças (SSG) | Grupo J.Macedo
// (03/11/2026) Atualiza sozinho a Base Peças e a Base GSPN a partir das
// planilhas que o Robô GSPN salva no OneDrive:
//   <PASTA>\PEÇAS\base_pecas.xlsx                  (+ ULTIMA_ATUALIZACAO.json)
//   <PASTA>\BASE DE DADOS\base_ordens_servico.xlsx (+ ULTIMA_ATUALIZACAO.json)
// Roda a cada 2 minutos pelo Agendador de Tarefas (INSTALAR ROBO.bat).
// Processa só quando a versão do arquivo consolidado mudou, quando alguém
// clica em "Forçar atualização" na tela Carregar Bases, ou com --forcar.
// Usa o MESMO processamento da tela (lib/processarBases.js).
// Credenciais: lidas do .env.local do projeto (nunca ficam aqui).
// =====================================================================
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, "..");
const require = createRequire(path.join(RAIZ, "package.json"));
const ARQ_LOG = path.join(__dirname, "robo.log");
const ARQ_LOCK = path.join(__dirname, "robo.lock");
const FORCAR_ARG = process.argv.includes("--forcar");

function agoraTxt() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
function log(msg) {
  const linha = `[${agoraTxt()}] ${msg}`;
  console.log(linha);
  try {
    if (fs.existsSync(ARQ_LOG) && fs.statSync(ARQ_LOG).size > 2 * 1024 * 1024) {
      fs.renameSync(ARQ_LOG, ARQ_LOG + ".antigo");
    }
    fs.appendFileSync(ARQ_LOG, linha + "\r\n");
  } catch (e) {}
}

function lerIni(arquivo) {
  const cfg = {};
  if (!fs.existsSync(arquivo)) return cfg;
  for (const bruta of fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const l = bruta.trim();
    if (!l || l.startsWith(";") || l.startsWith("#")) continue;
    const i = l.indexOf("=");
    if (i < 0) continue;
    cfg[l.slice(0, i).trim().toUpperCase()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return cfg;
}

// "2026-11-03 17:11:22" (horário de Brasília) -> ISO com fuso
function salvoEmIso(txt) {
  if (!txt) return null;
  const m = String(txt).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(:\d{2})?)$/);
  return m ? `${m[1]}T${m[2]}${m[3] ? "" : ":00"}-03:00` : null;
}

function lerJson(arquivo) {
  if (!fs.existsSync(arquivo)) return null;
  try { return JSON.parse(fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, "")); } catch (e) { return null; }
}

function lerPlanilha(arquivo, XLSX) {
  const wb = XLSX.readFile(arquivo, { dense: true });
  const sh = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sh, { header: 1, raw: true, defval: "" });
}

// lib/*.js do projeto são módulos ES sem "type: module" — copia para .mjs
// numa pasta interna para o Node conseguir importar o MESMO código da tela.
async function carregarProcessamento() {
  const dir = path.join(__dirname, ".cache");
  fs.mkdirSync(dir, { recursive: true });
  const cls = fs.readFileSync(path.join(RAIZ, "lib", "classificacao.js"), "utf8");
  const proc = fs.readFileSync(path.join(RAIZ, "lib", "processarBases.js"), "utf8")
    .replace(/from\s+["']\.\/classificacao(\.js)?["']/g, 'from "./classificacao.mjs"');
  fs.writeFileSync(path.join(dir, "classificacao.mjs"), cls);
  fs.writeFileSync(path.join(dir, "processarBases.mjs"), proc);
  const mod = await import(pathToFileURL(path.join(dir, "processarBases.mjs")).href + "?v=" + Date.now());
  return mod.processarBases;
}

async function main() {
  // trava: não deixa duas execuções ao mesmo tempo (uma base grande pode levar minutos)
  if (fs.existsSync(ARQ_LOCK)) {
    const idade = Date.now() - fs.statSync(ARQ_LOCK).mtimeMs;
    if (idade < 40 * 60 * 1000) return;
  }
  fs.writeFileSync(ARQ_LOCK, String(process.pid));

  let sb = null;
  let unidade = null;
  try {
    const cfg = lerIni(path.join(__dirname, "config.ini"));
    const env = lerIni(path.join(RAIZ, ".env.local"));
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) throw new Error("Não encontrei NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local do projeto.");
    const pasta = cfg.PASTA;
    const ascCod = cfg.ASC_COD;
    if (!pasta || !ascCod) throw new Error("Preencha PASTA e ASC_COD no config.ini do robô.");

    const { createClient } = require("@supabase/supabase-js");
    const XLSX = require("xlsx");
    sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });

    const { data: u, error: eU } = await sb.from("unidades").select("id, nome, asc_cod").eq("asc_cod", ascCod).maybeSingle();
    if (eU) throw new Error("Falha ao ler a unidade: " + eU.message);
    if (!u) throw new Error(`Nenhuma unidade com ASC COD ${ascCod} em Configurações > Unidades.`);
    unidade = u;

    const { data: status } = await sb.from("bases_robo_status").select("*").eq("unidade_id", unidade.id).maybeSingle();
    // batimento: a tela usa para saber se o robô está vivo
    await sb.from("bases_robo_status").upsert({ unidade_id: unidade.id, ultima_verificacao: new Date().toISOString(), atualizado_em: new Date().toISOString() });

    const dirPecas = path.join(pasta, "PEÇAS");
    const dirGspn = path.join(pasta, "BASE DE DADOS");
    const jsonPecas = lerJson(path.join(dirPecas, "ULTIMA_ATUALIZACAO.json"));
    const jsonGspn = lerJson(path.join(dirGspn, "ULTIMA_ATUALIZACAO.json"));
    const arqPecas = path.join(dirPecas, "base_pecas.xlsx");
    const arqGspn = path.join(dirGspn, "base_ordens_servico.xlsx");
    if (!fs.existsSync(arqPecas)) throw new Error("Não achei " + arqPecas);
    if (!fs.existsSync(arqGspn)) throw new Error("Não achei " + arqGspn);

    const versaoPecas = jsonPecas?.versao || String(Math.floor(fs.statSync(arqPecas).mtimeMs));
    const versaoGspn = jsonGspn?.versao || String(Math.floor(fs.statSync(arqGspn).mtimeMs));
    const pedidoTela = status?.forcar_pedido_em && (!status.forcar_atendido_em || new Date(status.forcar_pedido_em) > new Date(status.forcar_atendido_em));
    const forcar = FORCAR_ARG || !!pedidoTela;
    const mudouPecas = versaoPecas !== status?.pecas_versao;
    const mudouGspn = versaoGspn !== status?.gspn_versao;
    if (!forcar && !mudouPecas && !mudouGspn) return; // nada novo

    // o Robô GSPN pode estar gravando o arquivo agora: espera assentar
    const recente = (a) => Date.now() - fs.statSync(a).mtimeMs < 60 * 1000;
    if (recente(arqPecas) || recente(arqGspn)) { log("Arquivo sendo gravado pelo Robô GSPN — tento de novo na próxima volta."); return; }

    const motivo = [forcar ? (FORCAR_ARG ? "ENVIAR AGORA" : `pedido na tela por ${status?.forcar_pedido_por_nome || "?"}`) : null, mudouPecas ? "Base Peças nova" : null, mudouGspn ? "Base GSPN nova" : null].filter(Boolean).join(", ");
    log(`[${unidade.nome}] Atualizando (${motivo})...`);
    const inicio = Date.now();
    await sb.from("bases_robo_status").update({ em_processamento: true, processamento_inicio: new Date().toISOString() }).eq("unidade_id", unidade.id);

    const processarBases = await carregarProcessamento();
    const pecasSalvoEm = salvoEmIso(jsonPecas?.atualizado_em);
    const gspnSalvoEm = salvoEmIso(jsonGspn?.atualizado_em);
    const extras = { origem: "robo", arquivo_pecas_salvo_em: pecasSalvoEm, arquivo_gspn_salvo_em: gspnSalvoEm };

    log(`[${unidade.nome}] Lendo base_pecas.xlsx...`);
    const pecasRows = lerPlanilha(arqPecas, XLSX);
    let gspnRows = null;
    if (mudouGspn || forcar) {
      log(`[${unidade.nome}] Lendo base_ordens_servico.xlsx...`);
      gspnRows = lerPlanilha(arqGspn, XLSX);
      // 1ª passada: catálogo (modelo/categoria/descrição) + preço das peças do GSPN + Deliveries
      const r1 = await processarBases({ supabase: sb, unidadeAtiva: unidade, pecasRows, gspnRows, nomeArquivoPecas: "base_pecas.xlsx (robô)", nomeArquivoGspn: "base_ordens_servico.xlsx (robô)", extrasProcessamento: extras, lotesSomenteNovos: true });
      log(`[${unidade.nome}] Catálogo: ${r1.totalRegistros} registro(s), ${r1.novasPecas} peça(s) nova(s), ${r1.totalLotes} Delivery(s) gravada(s).`);
    }
    // 2ª passada (sempre): preço de TODA peça da Base Peças, mesmo sem modelo no GSPN
    // (as Deliveries só são gravadas aqui se a 1ª passada não rodou)
    const r2 = await processarBases({ supabase: sb, unidadeAtiva: unidade, pecasRows, nomeArquivoPecas: "base_pecas.xlsx (robô)", extrasProcessamento: extras, gravarLotes: !gspnRows, lotesSomenteNovos: true });
    log(`[${unidade.nome}] Preços: ${r2.precosAtualizados} atualizado(s), ${r2.totalLotes} Delivery(s) gravada(s).`);

    const agora = new Date().toISOString();
    const upd = {
      em_processamento: false,
      ultimo_erro: null,
      ultimo_erro_em: null,
      pecas_versao: versaoPecas,
      pecas_salvo_em: pecasSalvoEm,
      pecas_processado_em: agora,
      pecas_total: jsonPecas?.total_linhas ?? Math.max(0, pecasRows.length - 1),
      atualizado_em: agora
    };
    if (gspnRows) {
      Object.assign(upd, {
        gspn_versao: versaoGspn,
        gspn_salvo_em: gspnSalvoEm,
        gspn_processado_em: agora,
        gspn_total: jsonGspn?.total_os ?? Math.max(0, gspnRows.length - 1)
      });
    }
    if (pedidoTela) upd.forcar_atendido_em = agora;
    await sb.from("bases_robo_status").update(upd).eq("unidade_id", unidade.id);
    log(`[${unidade.nome}] Concluído em ${Math.round((Date.now() - inicio) / 1000)}s.`);
  } catch (e) {
    log("ERRO: " + (e?.message || e));
    if (sb && unidade) {
      await sb.from("bases_robo_status").update({ em_processamento: false, ultimo_erro: String(e?.message || e).slice(0, 500), ultimo_erro_em: new Date().toISOString() }).eq("unidade_id", unidade.id);
    }
    process.exitCode = 1;
  } finally {
    try { fs.unlinkSync(ARQ_LOCK); } catch (e) {}
  }
}

main();
