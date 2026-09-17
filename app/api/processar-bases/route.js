import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { classifyDesc, categoria, normKey, parseBRDate, findExact } from "../../../lib/classificacao";

export const runtime = "nodejs";
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verificarPermissao(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: perfil } = await supabaseAdmin.from("perfis").select("*").eq("id", user.id).single();
  if (!perfil || !["Administrador", "Diretor"].includes(perfil.cargo)) return null;
  return perfil;
}

function lerPlanilha(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
}

export async function POST(req) {
  const perfil = await verificarPermissao(req);
  if (!perfil) {
    return NextResponse.json({ erro: "Sem permissão para processar bases." }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const arquivoPecas = form.get("basePecas");
    const arquivoGspn = form.get("baseGspn");
    if (!arquivoPecas || !arquivoGspn) {
      return NextResponse.json({ erro: "Envie os dois arquivos: Base Peças e Base GSPN." }, { status: 400 });
    }

    const pecasRows = lerPlanilha(Buffer.from(await arquivoPecas.arrayBuffer()));
    const pHeaders = pecasRows[0].map(normKey);

    const idxDataNF = findExact(pHeaders, "data nf");
    const idxPecasEnv = findExact(pHeaders, "pecas enviadas");
    const idxQtd = findExact(pHeaders, "qtd");
    const idxValor = findExact(pHeaders, "valor");
    const idxBilling = findExact(pHeaders, "nro. billing");
    const idxDocConta = findExact(pHeaders, "documento de conta");
    const idxItemNro = findExact(pHeaders, "item nro.");
    const idxArrived = findExact(pHeaders, "arrived date");

    const faltando = [];
    if (idxDataNF < 0) faltando.push("Data NF");
    if (idxPecasEnv < 0) faltando.push("Peças enviadas");
    if (idxQtd < 0) faltando.push("Qtd");
    if (idxValor < 0) faltando.push("Valor");
    if (faltando.length) {
      return NextResponse.json({ erro: `Colunas não encontradas na Base Peças: ${faltando.join(", ")}` }, { status: 400 });
    }

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
      const completo = idxArrived >= 0 ? (String(row[idxArrived] || "").trim() !== "-" && String(row[idxArrived] || "").trim() !== "") : false;
      const existente = dedupMap.get(key);
      if (!existente || (completo && !existente._completo)) {
        dedupMap.set(key, {
          codigo: code.toUpperCase(),
          qtd: Number(row[idxQtd]) || 0,
          valor: Number(row[idxValor]) || 0,
          dataNF: idxDataNF >= 0 ? row[idxDataNF] : "",
          _completo: completo
        });
      }
    }
    const pecasDedup = Array.from(dedupMap.values());
    const duplicadosRemovidos = (pecasRows.length - 1) - pecasDedup.length;

    const precoMap = new Map();
    for (const p of pecasDedup) {
      if (!p.qtd || !p.valor) continue;
      const ts = parseBRDate(p.dataNF);
      const atual = precoMap.get(p.codigo);
      if (!atual || (ts !== null && (atual.ts === null || ts > atual.ts))) {
        precoMap.set(p.codigo, { valor: p.valor / p.qtd, ts });
      }
    }

    const gspnRows = lerPlanilha(Buffer.from(await arquivoGspn.arrayBuffer()));
    const gHeaders = gspnRows[0].map(normKey);
    const idxModelo = findExact(gHeaders, "modelo");
    const idxBH = findExact(gHeaders, "service product description");
    if (idxModelo < 0 || idxBH < 0) {
      return NextResponse.json({ erro: "Colunas Modelo e/ou Service Product Description não encontradas na Base GSPN." }, { status: 400 });
    }

    const slots = [];
    for (let n = 1; n <= 10; n++) {
      const suf = n < 10 ? "0" + n : "10";
      const iCod = findExact(gHeaders, "codigo da peca" + suf);
      const iDesc = findExact(gHeaders, "pecas description " + suf);
      if (iCod >= 0 && iDesc >= 0) slots.push({ cod: iCod, desc: iDesc });
    }
    if (slots.length === 0) {
      return NextResponse.json({ erro: "Nenhuma coluna de peças (Código da peça01...10) encontrada na Base GSPN." }, { status: 400 });
    }

    const uniqueMap = new Map();
    let naoClassificados = 0, semCusto = 0;
    const modelosSet = new Set();

    for (let r = 1; r < gspnRows.length; r++) {
      const grow = gspnRows[r];
      if (!grow || grow.length === 0) continue;
      const modelo = String(grow[idxModelo] || "").trim();
      if (!modelo) continue;
      const cat = categoria(grow[idxBH]);
      modelosSet.add(modelo);
      for (const slot of slots) {
        const codigo = String(grow[slot.cod] || "").trim();
        if (!codigo) continue;
        const descPeca = grow[slot.desc];
        const resumida = classifyDesc(descPeca);
        if (resumida === "Outros / Não Classificado") naoClassificados++;
        const uKey = modelo.toUpperCase() + "||" + codigo.toUpperCase();
        if (uniqueMap.has(uKey)) continue;
        const preco = precoMap.get(codigo.toUpperCase());
        if (!preco) semCusto++;
        uniqueMap.set(uKey, {
          modelo,
          categoria: cat,
          codigo: codigo.toUpperCase(),
          descricao_resumida: resumida,
          descricao_peca: descPeca ? String(descPeca).trim() : "",
          valor_unitario: preco ? Math.round(preco.valor * 100) / 100 : null
        });
      }
    }

    const registros = Array.from(uniqueMap.values());

    // substitui a base inteira: apaga tudo e insere de novo em lotes
    const { error: delError } = await supabaseAdmin.from("pecas").delete().gte("id", 0);
    if (delError) throw delError;

    const LOTE = 1000;
    for (let i = 0; i < registros.length; i += LOTE) {
      const lote = registros.slice(i, i + LOTE);
      const { error: insError } = await supabaseAdmin.from("pecas").insert(lote);
      if (insError) throw insError;
    }

    await supabaseAdmin.from("pecas_processamentos").insert({
      usuario_id: perfil.id,
      arquivo_pecas: arquivoPecas.name,
      arquivo_gspn: arquivoGspn.name,
      total_registros: registros.length,
      duplicados_removidos: duplicadosRemovidos,
      nao_classificados: naoClassificados,
      sem_custo: semCusto
    });

    return NextResponse.json({
      ok: true,
      totalRegistros: registros.length,
      totalModelos: modelosSet.size,
      duplicadosRemovidos,
      naoClassificados,
      semCusto
    });
  } catch (err) {
    return NextResponse.json({ erro: "Falha ao processar: " + err.message }, { status: 500 });
  }
}
