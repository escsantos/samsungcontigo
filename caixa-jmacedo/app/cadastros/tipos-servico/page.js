"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeCadastrarTipoServicoOuModelo } from "../../../lib/permissions";

function ConteudoTiposServico() {
  const { usuario } = useSessao();
  const [tipos, setTipos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");

  async function carregar() {
    const { data: t } = await supabase.from("tipos_servico").select("*, categorias(nome)").order("nome");
    setTipos(t || []);
    const { data: c } = await supabase.from("categorias").select("*").order("nome");
    setCategorias(c || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("tipos_servico").insert({ nome: nome.toUpperCase(), categoria_id: categoriaId });
    setNome("");
    carregar();
  }

  const permitido = podeCadastrarTipoServicoOuModelo(usuario.cargo);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Cadastros</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Tipos de serviço</h1>
        <p className="text-sm text-muted mt-1">{tipos.length} tipos cadastrados</p>
      </div>

      {permitido && (
        <form onSubmit={salvar} className="card p-4 flex gap-3 mb-6 items-end">
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
            <label className="field-label">Nome do tipo de serviço</label>
            <input className="field-input" placeholder="Ex: Celular - reparo tela" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
      )}
      {!permitido && (
        <p className="text-sm text-muted mb-4">Somente Supervisão, Gerência, Administrador ou Diretor cadastram tipos de serviço.</p>
      )}

      <div className="card divide-y divide-line">
        {tipos.map((t) => (
          <div key={t.id} className="p-3 flex justify-between text-sm">
            <span>{t.nome}</span>
            <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{t.categorias?.nome}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CadastroTiposServico() {
  return (
    <AppShell>
      <ConteudoTiposServico />
    </AppShell>
  );
}
