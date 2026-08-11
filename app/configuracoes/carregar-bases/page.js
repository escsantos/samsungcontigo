"use client";
import { useEffect, useState } from "react";
import { UploadCloud, ShieldAlert } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { classifyDesc, categoria, normKey, parseBRDate, findExact } from "../../../lib/classificacao";
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
  const [arquivoPecas, setArquivoPecas] = useState(null);
  const [arquivoGspn, setArquivoGspn] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [progresso, setProgresso] = useState({ pct: 0, texto: "" });
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => setPerfil(await getPerfilAtual()))();
  }, []);

  const [confirmando, setConfirmando] = useState(false);

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
      setProgresso({ pct: 5, texto: "Lendo Base Peças..." });
      await sleep(0);
      const pecasRows = await lerPlanilha(arquivoPecas);
      const pHeaders = pecasRows[0].map(normKey);

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

      setProgresso({ pct: 20, texto: "Removendo duplicados da Base Peças..." });
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
            qtd: Number(row[idxQtd]) || 0,
            valor: Number(row[idxValor]) || 0,
            dataNF: idxDataNF >= 0 ? row[idxDataNF] : "",
            entrega: idxEntrega >= 0 ? String(row[idxEntrega] || "").trim() : "",
            _completo: completo
          });
        }
      }
      const pecasDedup = Array.from(dedupMap.values());
      const duplicadosRemovidos = (pecasRows.length - 1) - pecasDedup.length;

      setProgresso({ pct: 32, texto: "Calculando valor unitário mais recente por código..." });
      await sleep(0);
      const precoMap = new Map();
      for (const p of pecasDedup) {
        if (!p.qtd || !p.valor) continue;
        const ts = parseBRDate(p.dataNF);
        const atual = precoMap.get(p.codigo);
        if (!atual || (ts !== null && (atual.ts === null || ts > atual.ts))) {
          precoMap.set(p.codigo, { valor: p.valor / p.qtd, ts, dataNF: p.dataNF });
        }
      }

      setProgresso({ pct: 38, texto: "Montando lotes por Delivery (custo exato por remessa)..." });
      await sleep(0);
      const lotesMap = new Map();
      let semEntrega = 0;
      for (const p of pecasDedup) {
        if (!p.qtd || !p.valor) continue;
        if (!p.entrega) { semEntrega++; continue; }
        const chave = `${p.codigo}||${p.entrega}`;
        lotesMap.set(chave, {
          codigo: p.codigo,
          no_entrega: p.entrega,
          valor_unitario: Math.round((p.valor / p.qtd) * 100) / 100,
          qtd: p.qtd,
          data_nf: p.dataNF
        });
      }
      const lotes = Array.from(lotesMap.values());

      setProgresso({ pct: 50, texto: "Lendo Base GSPN..." });
      await sleep(0);
      const gspnRows = await lerPlanilha(arquivoGspn);
      const gHeaders = gspnRows[0].map(normKey);
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
      const uniqueMap = new Map();
      let naoClassificados = 0, semCusto = 0;
      const modelosSet = new Set();

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
          const descPeca = grow[slot.desc];
          const resumida = classifyDesc(descPeca);
          if (resumida === "Outros / Não Classificado") naoClassificados++;
          const catFinal = cat;
          const uKey = modelo.toUpperCase() + "||" + codigo.toUpperCase();
          if (uniqueMap.has(uKey)) continue;
          const preco = precoMap.get(codigo.toUpperCase());
          if (!preco) semCusto++;
          uniqueMap.set(uKey, {
            modelo,
            categoria: catFinal,
            codigo: codigo.toUpperCase(),
            descricao_resumida: resumida,
            descricao_peca: descPeca ? String(descPeca).trim() : "",
            valor_unitario: preco ? Math.round(preco.valor * 100) / 100 : null,
            data_referencia: preco ? preco.dataNF : null
          });
        }
      }

      const registros = Array.from(uniqueMap.values());

      setProgresso({ pct: 80, texto: "Apagando base antiga no Supabase..." });
      await sleep(0);
      const { error: delError } = await supabase.from("pecas").delete().gte("id", 0);
      if (delError) throw new Error("Falha ao limpar base antiga: " + delError.message);

      setProgresso({ pct: 85, texto: `Gravando ${registros.length.toLocaleString("pt-BR")} peças no Supabase...` });
      const LOTE = 500;
      for (let i = 0; i < registros.length; i += LOTE) {
        const lote = registros.slice(i, i + LOTE);
        const { error: insError } = await supabase.from("pecas").insert(lote);
        if (insError) throw new Error("Falha ao gravar peças: " + insError.message);
        setProgresso({
          pct: 85 + Math.round((i / registros.length) * 13),
          texto: `Gravando peças... ${Math.min(i + LOTE, registros.length).toLocaleString("pt-BR")} / ${registros.length.toLocaleString("pt-BR")}`
        });
        await sleep(0);
      }

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("pecas_processamentos").insert({
        usuario_id: user?.id,
        arquivo_pecas: arquivoPecas.name,
        arquivo_gspn: arquivoGspn.name,
        total_registros: registros.length,
        duplicados_removidos: duplicadosRemovidos,
        nao_classificados: naoClassificados,
        sem_custo: semCusto
      });

      setProgresso({ pct: 96, texto: "Salvando lotes por Delivery..." });
      await sleep(0);
      const { error: delLotesError } = await supabase.from("lotes_pecas").delete().gte("id", 0);
      if (delLotesError) throw new Error("Falha ao limpar lotes antigos: " + delLotesError.message);
      for (let i = 0; i < lotes.length; i += LOTE) {
        const bloco = lotes.slice(i, i + LOTE);
        const { error: insLotesError } = await supabase.from("lotes_pecas").insert(bloco);
        if (insLotesError) throw new Error("Falha ao gravar lotes: " + insLotesError.message);
      }

      setProgresso({ pct: 100, texto: "Concluído." });
      await sleep(150);

      setResultado({
        totalRegistros: registros.length,
        totalModelos: modelosSet.size,
        duplicadosRemovidos,
        naoClassificados,
        semCusto,
        totalLotes: lotes.length,
        semEntrega
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

  return (
    <AppShell titulo="Carregar Bases">
      <div className="card p-6 max-w-2xl">
        <p className="font-display font-semibold text-[15px] mb-1">Carregar bases de dados</p>
        <p className="text-sm text-muted mb-5">
          Suba a Base Peças (compras) e a Base GSPN (ordens de serviço). O processamento roda aqui no navegador e
          substitui a base de peças atual pela nova — cuidado ao reprocessar em horário de uso.
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

        <button
          className="btn-primary"
          disabled={!arquivoPecas || !arquivoGspn || processando || concluido}
          onClick={() => setConfirmando(true)}
        >
          <UploadCloud size={16} />
          {processando ? "Processando..." : concluido ? "Base processada" : "Processar bases"}
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
        title="Substituir base de peças?"
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
          Isso vai apagar a base de peças atual e substituir pelos dois arquivos selecionados. Essa mudança fica
          visível pra todo mundo que usa o sistema imediatamente.
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
            <Stat n={resultado.totalRegistros} label="combinações peça/modelo" />
            <Stat n={resultado.totalModelos} label="modelos distintos" />
            <Stat n={resultado.duplicadosRemovidos} label="duplicados removidos" />
            <Stat n={resultado.naoClassificados} label="não classificadas" />
            <Stat n={resultado.semCusto} label="sem custo encontrado" />
            <Stat n={resultado.totalLotes} label="lotes por Delivery gravados" />
            <Stat n={resultado.semEntrega} label="compras sem nº de Delivery" />
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
