"use client";
import { useEffect, useState } from "react";
import { UploadCloud, ShieldAlert } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";

export default function CarregarBasesPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [arquivoPecas, setArquivoPecas] = useState(null);
  const [arquivoGspn, setArquivoGspn] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => setPerfil(await getPerfilAtual()))();
  }, []);

  async function processar() {
    setErro("");
    setResultado(null);
    setProcessando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("basePecas", arquivoPecas);
      form.append("baseGspn", arquivoGspn);
      const resp = await fetch("/api/processar-bases", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.erro || "Falha ao processar.");
      setResultado(json);
    } catch (e) {
      setErro(e.message);
    }
    setProcessando(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Carregar Bases"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Carregar Bases">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador e Diretor podem carregar e reprocessar as bases.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Carregar Bases">
      <div className="card p-6 max-w-2xl">
        <p className="font-display font-semibold text-[15px] mb-1">Carregar bases de dados</p>
        <p className="text-sm text-muted mb-5">
          Suba a Base Peças (compras) e a Base GSPN (ordens de serviço). O processamento substitui a base de peças
          atual pela nova — cuidado ao reprocessar em horário de uso.
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
          disabled={!arquivoPecas || !arquivoGspn || processando}
          onClick={processar}
        >
          <UploadCloud size={16} />
          {processando ? "Processando... isso pode levar um minuto" : "Processar bases"}
        </button>

        {erro && <div className="mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

        {resultado && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat n={resultado.totalRegistros} label="combinações peça/modelo" />
            <Stat n={resultado.totalModelos} label="modelos distintos" />
            <Stat n={resultado.duplicadosRemovidos} label="duplicados removidos" />
            <Stat n={resultado.naoClassificados} label="não classificadas" />
          </div>
        )}
      </div>
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
