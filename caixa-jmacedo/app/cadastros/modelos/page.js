"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeCadastrarTipoServicoOuModelo } from "../../../lib/permissions";

function ConteudoModelos() {
  const { usuario } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [nomeModelo, setNomeModelo] = useState("");

  async function carregar() {
    const { data: c } = await supabase.from("categorias").select("*").order("nome");
    setCategorias(c || []);
    const { data: m } = await supabase.from("modelos").select("*, categorias(nome)").order("nome");
    setModelos(m || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarCategoria(e) {
    e.preventDefault();
    await supabase.from("categorias").insert({ nome: novaCategoria });
    setNovaCategoria("");
    carregar();
  }

  async function salvarModelo(e) {
    e.preventDefault();
    await supabase.from("modelos").insert({ categoria_id: categoriaId, nome: nomeModelo });
    setNomeModelo("");
    carregar();
  }

  const permitido = podeCadastrarTipoServicoOuModelo(usuario.cargo);
  if (!permitido) {
    return <p className="text-sm text-muted">Somente Supervisão, Gerência, Administrador ou Diretor cadastram categorias/modelos.</p>;
  }

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Cadastros</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Categorias e modelos</h1>
      </div>

      <section>
        <h2 className="font-display text-base font-semibold text-ink mb-3">Categorias</h2>
        <form onSubmit={salvarCategoria} className="card p-4 flex gap-3 mb-4 items-end">
          <div className="flex-1">
            <label className="field-label">Nova categoria</label>
            <input className="field-input" placeholder="Ex: Robô" value={novaCategoria} onChange={(e) => setNovaCategoria(e.target.value)} required />
          </div>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => (
            <span key={c.id} className="text-sm bg-white border border-line rounded-full px-3 py-1">{c.nome}</span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-base font-semibold text-ink mb-3">Modelos</h2>
        <form onSubmit={salvarModelo} className="card p-4 flex gap-3 mb-4 items-end">
          <div className="w-48">
            <label className="field-label">Categoria</label>
            <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
              <option value="">Selecione</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="field-label">Nome do modelo</label>
            <input className="field-input" placeholder="Ex: S24 Ultra" value={nomeModelo} onChange={(e) => setNomeModelo(e.target.value)} required />
          </div>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
        <div className="card divide-y divide-line">
          {modelos.map((m) => (
            <div key={m.id} className="p-3 flex justify-between text-sm">
              <span>{m.nome}</span>
              <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{m.categorias?.nome}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function CadastroModelos() {
  return (
    <AppShell>
      <ConteudoModelos />
    </AppShell>
  );
}
