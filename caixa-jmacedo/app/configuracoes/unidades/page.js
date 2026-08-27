"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigUnidades } from "../../../lib/permissions";

function Conteudo() {
  const { usuario } = useSessao();
  const [unidades, setUnidades] = useState([]);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [atendeCiNova, setAtendeCiNova] = useState(true);
  const [atendeIhNova, setAtendeIhNova] = useState(false);
  const [edicoes, setEdicoes] = useState({}); // { unidadeId: { nome, codigo, atende_ci, atende_ih } }
  const [salvos, setSalvos] = useState({});
  const [salvandoTodas, setSalvandoTodas] = useState(false);

  async function carregar() {
    const { data } = await supabase.from("unidades").select("*").order("nome");
    setUnidades(data || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("unidades").insert({ nome, codigo: codigo.toUpperCase(), atende_ci: atendeCiNova, atende_ih: atendeIhNova });
    setNome("");
    setCodigo("");
    setAtendeCiNova(true);
    setAtendeIhNova(false);
    carregar();
  }

  async function salvarAlteracao(unidade) {
    const edicao = edicoes[unidade.id] || {};
    const novoNome = (edicao.nome ?? unidade.nome).trim();
    const novoCodigo = (edicao.codigo ?? unidade.codigo).toUpperCase().slice(0, 7);
    const novoAtendeCi = edicao.atende_ci ?? unidade.atende_ci;
    const novoAtendeIh = edicao.atende_ih ?? unidade.atende_ih;
    await supabase
      .from("unidades")
      .update({ nome: novoNome, codigo: novoCodigo, atende_ci: novoAtendeCi, atende_ih: novoAtendeIh })
      .eq("id", unidade.id);
    setEdicoes((atual) => {
      const { [unidade.id]: _removida, ...resto } = atual;
      return resto;
    });
    setSalvos((s) => ({ ...s, [unidade.id]: true }));
    await carregar();
  }

  async function salvarTodas() {
    const idsAlterados = Object.keys(edicoes);
    if (idsAlterados.length === 0) return;
    setSalvandoTodas(true);
    for (const id of idsAlterados) {
      const unidade = unidades.find((u) => u.id === id);
      if (unidade) await salvarAlteracao(unidade);
    }
    setSalvandoTodas(false);
  }

  function atualizarEdicao(id, campo, valor) {
    setEdicoes((atual) => ({ ...atual, [id]: { ...atual[id], [campo]: valor } }));
    setSalvos((s) => ({ ...s, [id]: false }));
  }

  const permitido = podeConfigUnidades(usuario.cargo);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Unidades</h1>
        <p className="text-sm text-muted mt-1">{unidades.length} lojas cadastradas</p>
      </div>

      {permitido && (
        <form onSubmit={salvar} className="card p-4 flex gap-3 mb-6 items-end">
          <div className="flex-1">
            <label className="field-label">Nome da unidade</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="w-32">
            <label className="field-label">ASC Cod.</label>
            <input className="field-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={7} required />
          </div>
          <div className="flex items-center gap-3 pb-2.5">
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" checked={atendeCiNova} onChange={(e) => setAtendeCiNova(e.target.checked)} /> CI
            </label>
            <label className="flex items-center gap-1.5 text-sm text-muted">
              <input type="checkbox" checked={atendeIhNova} onChange={(e) => setAtendeIhNova(e.target.checked)} /> IH
            </label>
          </div>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
      )}
      {!permitido && (
        <p className="text-sm text-muted mb-4">Somente o Administrador cadastra e altera unidades.</p>
      )}

      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted">{Object.keys(edicoes).length > 0 ? `${Object.keys(edicoes).length} unidade(s) com alteração pendente` : ""}</p>
        {permitido && Object.keys(edicoes).length > 0 && (
          <button className="btn-primary flex items-center gap-1.5 text-sm" onClick={salvarTodas} disabled={salvandoTodas}>
            <Save size={14} /> {salvandoTodas ? "Salvando…" : "Salvar todas as alterações"}
          </button>
        )}
      </div>

      <div className="card divide-y divide-line">
        {unidades.map((u) => {
          const temEdicao = !!edicoes[u.id];
          return (
          <div key={u.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            {permitido ? (
              <input
                className="field-input flex-1"
                value={edicoes[u.id]?.nome ?? u.nome}
                onChange={(e) => atualizarEdicao(u.id, "nome", e.target.value)}
              />
            ) : (
              <span>{u.nome}</span>
            )}
            {permitido ? (
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={edicoes[u.id]?.atende_ci ?? u.atende_ci}
                    onChange={(e) => atualizarEdicao(u.id, "atende_ci", e.target.checked)}
                  /> CI
                </label>
                <label className="flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={edicoes[u.id]?.atende_ih ?? u.atende_ih}
                    onChange={(e) => atualizarEdicao(u.id, "atende_ih", e.target.checked)}
                  /> IH
                </label>
                <input
                  className="field-input w-24"
                  maxLength={7}
                  value={edicoes[u.id]?.codigo ?? u.codigo}
                  onChange={(e) => atualizarEdicao(u.id, "codigo", e.target.value.toUpperCase())}
                />
                <button
                  className={`p-1.5 rounded-md transition ${
                    salvos[u.id] ? "text-white bg-teal" : temEdicao ? "text-gold-strong hover:bg-gold-soft/40" : "text-muted hover:bg-canvas"
                  }`}
                  title={salvos[u.id] ? "Salvo" : "Salvar"}
                  onClick={() => salvarAlteracao(u)}
                >
                  <Save size={16} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">{u.codigo}</span>
                {u.atende_ci && <span className="text-[10px] bg-canvas px-1.5 py-0.5 rounded text-muted">CI</span>}
                {u.atende_ih && <span className="text-[10px] bg-teal-soft text-teal px-1.5 py-0.5 rounded">IH</span>}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CadastroUnidades() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
