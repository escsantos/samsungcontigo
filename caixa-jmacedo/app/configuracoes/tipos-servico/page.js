"use client";
import { useEffect, useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigTiposServico } from "../../../lib/permissions";

function Conteudo() {
  const { usuario } = useSessao();
  const [tipos, setTipos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [nome, setNome] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [editando, setEditando] = useState(null); // id em edição
  const [nomeEdicao, setNomeEdicao] = useState("");

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

  async function salvarEdicao(id) {
    const { data, error } = await supabase.from("tipos_servico").update({ nome: nomeEdicao.toUpperCase() }).eq("id", id).select();
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Não foi possível salvar — você não tem permissão para esta ação.");
      return;
    }
    setEditando(null);
    carregar();
  }

  async function excluir(t) {
    const { count } = await supabase
      .from("lancamentos")
      .select("id", { count: "exact", head: true })
      .eq("tipo_servico_id", t.id);
    if (count > 0) {
      alert(`Não é possível excluir "${t.nome}" — já foi usado em ${count} lançamento(s).`);
      return;
    }
    if (!window.confirm(`Excluir o tipo de serviço "${t.nome}"?`)) return;
    const { data, error } = await supabase.from("tipos_servico").delete().eq("id", t.id).select();
    if (error) {
      alert("Erro ao excluir: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Não foi possível excluir — você não tem permissão para esta ação.");
      return;
    }
    carregar();
  }

  const podeCriar = podeConfigTiposServico(usuario.cargo);
  const podeEditar = podeConfigTiposServico(usuario.cargo); // administrador/diretor
  const podeExcluirItem = podeConfigTiposServico(usuario.cargo); // administrador/diretor

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Tipos de serviço</h1>
        <p className="text-sm text-muted mt-1">{tipos.length} tipos cadastrados</p>
      </div>

      {podeCriar && (
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
      {!podeCriar && (
        <p className="text-sm text-muted mb-4">Somente Gerência, Administrador ou Diretor cadastram tipos de serviço.</p>
      )}

      <div className="card divide-y divide-line">
        {tipos.map((t) => (
          <div key={t.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            {editando === t.id ? (
              <input
                className="field-input flex-1"
                value={nomeEdicao}
                onChange={(e) => setNomeEdicao(e.target.value)}
                autoFocus
              />
            ) : (
              <span>{t.nome}</span>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{t.categorias?.nome}</span>
              {podeEditar && editando !== t.id && (
                <button className="text-muted hover:text-gold transition p-1.5" title="Editar" onClick={() => { setEditando(t.id); setNomeEdicao(t.nome); }}>
                  <Pencil size={15} />
                </button>
              )}
              {podeEditar && editando === t.id && (
                <>
                  <button className="btn-primary" onClick={() => salvarEdicao(t.id)}>Salvar</button>
                  <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
                </>
              )}
              {podeExcluirItem && editando !== t.id && (
                <button className="text-muted hover:text-danger transition p-1.5" title="Excluir" onClick={() => excluir(t)}>
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TiposServicoPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
