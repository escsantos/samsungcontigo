// Sistema Consulta de Pecas (SSG) | Grupo J.Macedo
// Backup do Storage (pedido explicito, 04/10/2026) — baixa todo arquivo de
// todo bucket do Supabase Storage pra uma pasta local, usado pelo
// scripts/backup.bat (rotina manual de backup, mesmo estilo do
// "PUBLICAR GITHUB.bat"). Le a URL/chave do .env.local do projeto na hora de
// rodar — nunca recebe credencial por outro caminho.
//
// Uso: node backup-storage.mjs <pasta-destino>

import { createClient } from "@supabase/supabase-js";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const raizProjeto = path.join(__dirname, "..");

function lerEnvLocal() {
  const arquivo = path.join(raizProjeto, ".env.local");
  const env = {};
  if (!existsSync(arquivo)) return env;
  for (const linhaBruta of readFileSync(arquivo, "utf8").split("\n")) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;
    const idx = linha.indexOf("=");
    if (idx === -1) continue;
    let valor = linha.slice(idx + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    env[linha.slice(0, idx).trim()] = valor;
  }
  return env;
}

const envArquivo = lerEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || envArquivo.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY || envArquivo.SUPABASE_SERVICE_ROLE_KEY;
const destino = process.argv[2];

if (!url || !chave) {
  console.error("Nao encontrei NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local do projeto.");
  process.exit(1);
}
if (!destino) {
  console.error("Uso: node backup-storage.mjs <pasta-destino>");
  process.exit(1);
}

const admin = createClient(url, chave, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Lista recursivamente todo arquivo dentro de um bucket (storage.list()
// so devolve um nivel por vez; pastas vem sem "id", arquivos vem com id).
async function listarArquivos(bucket, prefixo = "") {
  const caminhos = [];
  const { data, error } = await admin.storage.from(bucket).list(prefixo, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw error;

  for (const item of data ?? []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name;
    if (item.id === null) {
      // é uma "pasta" dentro do bucket — desce mais um nível
      caminhos.push(...(await listarArquivos(bucket, caminho)));
    } else {
      caminhos.push(caminho);
    }
  }
  return caminhos;
}

async function main() {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) throw error;

  if (!buckets || buckets.length === 0) {
    console.log("Nenhum bucket encontrado no Storage.");
    return;
  }

  let totalArquivos = 0;
  let totalFalhas = 0;

  for (const bucket of buckets) {
    console.log(`Bucket: ${bucket.name}`);
    const arquivos = await listarArquivos(bucket.name);
    console.log(`  ${arquivos.length} arquivo(s) encontrado(s).`);

    for (const caminho of arquivos) {
      const { data: blob, error: erroDownload } = await admin.storage.from(bucket.name).download(caminho);
      if (erroDownload) {
        console.error(`  Falhou "${caminho}": ${erroDownload.message}`);
        totalFalhas++;
        continue;
      }
      const destinoArquivo = path.join(destino, bucket.name, caminho);
      mkdirSync(path.dirname(destinoArquivo), { recursive: true });
      writeFileSync(destinoArquivo, Buffer.from(await blob.arrayBuffer()));
      totalArquivos++;
    }
  }

  console.log(`Concluido: ${totalArquivos} arquivo(s) baixado(s)${totalFalhas > 0 ? `, ${totalFalhas} falha(s)` : ""}.`);
  if (totalFalhas > 0) process.exit(1);
}

main().catch((e) => {
  console.error("Erro ao baixar o Storage:", e?.message || e);
  process.exit(1);
});
