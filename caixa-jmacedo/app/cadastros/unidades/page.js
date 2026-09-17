"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeCadastrarUsuarioOuUnidade } from "../../../lib/permissions";

function ConteudoUnidades() {
  const { usuario } = useSessao();
  const [unidades, setUnidades] = useState([]);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");

  async function carregar() {
    const { data } = await supabase.from("unidades").select("*").order("nome");
    setUnidades(data || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("unidades").insert({ nome, codigo: codigo.toUpperCase() });
    setNome("");
    setCodigo("");
    carregar();
  }

  const permitido = podeCadastrarUsuarioOuUnidade(usuario.cargo);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Cadastros</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Unidades</h1>
        <p className="text-sm text-muted mt-1">{unidades.length} lojas cadastradas</p>
      </div>

      {permitido && (
        <form onSubmit={salvar} className="card p-4 flex gap-3 mb-6 items-end">
          <div className="flex-1">
            <label className="field-label">Nome da unidade</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="w-40">
            <label className="field-label">Código curto</label>
            <input className="field-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} maxLength={7} required />
          </div>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
      )}
      {!permitido && (
        <p className="text-sm text-muted mb-4">Somente Administrador ou Diretor podem cadastrar unidades.</p>
      )}

      <div className="card divide-y divide-line">
        {unidades.map((u) => (
          <div key={u.id} className="p-3 flex justify-between text-sm">
            <span>{u.nome}</span>
            <span className="font-mono-num text-muted text-xs bg-canvas px-2 py-0.5 rounded">{u.codigo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CadastroUnidades() {
  return (
    <AppShell>
      <ConteudoUnidades />
    </AppShell>
  );
}
