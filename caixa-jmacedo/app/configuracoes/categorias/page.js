"use client";
import { useEffect, useState } from "react";
import { Trash2, Pencil } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigCategorias } from "../../../lib/permissions";
import { iconeCategoria } from "../../../lib/iconesCategoria";

function Conteudo() {
  const { usuario } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [nome, setNome] = useState("");
  const [somenteIhNova, setSomenteIhNova] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [somenteIhEdicao, setSomenteIhEdicao] = useState(false);
  const [pareadaEdicao, setPareadaEdicao] = useState("");

  async function carregar() {
    const { data } = await supabase.from("categorias").select("*").order("nome");
    setCategorias(data || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvar(e) {
    e.preventDefault();
    await supabase.from("categorias").insert({ nome, somente_ih: somenteIhNova });
    setNome("");
    setSomenteIhNova(false);
    carregar();
  }

  async function salvarEdicao(id) {
    const { data, error } = await supabase
      .from("categorias")
      .update({ nome: nomeEdicao, somente_ih: somenteIhEdicao, categoria_pareada_id: pareadaEdicao || null })
      .eq("id", id)
      .select();
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Não foi possível salvar — você não tem permissão para esta ação.");
      return;
    }
    if (pareadaEdicao) {
      await supabase.from("categorias").update({ categoria_pareada_id: id }).eq("id", pareadaEdicao);
    }
    setEditando(null);
    carregar();
  }

  async function excluir(categoria) {
    const [emLancamentos, emTipos, emModelos] = await Promise.all([
      supabase.from("lancamentos").select("id", { count: "exact", head: true }).eq("categoria_id", categoria.id),
      supabase.from("tipos_servico").select("id", { count: "exact", head: true }).eq("categoria_id", categoria.id),
      supabase.from("modelos").select("id", { count: "exact", head: true }).eq("categoria_id", categoria.id),
    ]);
    const totalUso = (emLancamentos.count || 0) + (emTipos.count || 0) + (emModelos.count || 0);
    if (totalUso > 0) {
      alert(
        `Não é possível excluir "${categoria.nome}" — ela está em uso (${emLancamentos.count || 0} lançamento(s), ${emTipos.count || 0} tipo(s) de serviço, ${emModelos.count || 0} modelo(s)).`
      );
      return;
    }
    if (!window.confirm(`Excluir a categoria "${categoria.nome}"?`)) return;
    const { data, error } = await supabase.from("categorias").delete().eq("id", categoria.id).select();
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

  const permitido = podeConfigCategorias(usuario.cargo);
  if (!permitido) {
    return <p className="text-sm text-muted">Somente Gerência, Administrador ou Diretor cadastram categorias.</p>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Categorias</h1>
        <p className="text-sm text-muted mt-1">{categorias.length} categorias cadastradas</p>
      </div>

      <form onSubmit={salvar} className="card p-4 flex gap-3 mb-6 items-end">
        <div className="flex-1">
          <label className="field-label">Nova categoria</label>
          <input className="field-input" placeholder="Ex: Robô" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted pb-2.5">
          <input type="checkbox" checked={somenteIhNova} onChange={(e) => setSomenteIhNova(e.target.checked)} /> Somente IH
        </label>
        <button className="btn-primary" type="submit">Adicionar</button>
      </form>

      <div className="grid grid-cols-2 gap-3">
        {categorias.map((c) => {
          const Icone = iconeCategoria(c.nome);
          const emEdicao = editando === c.id;
          return (
            <div key={c.id} className="card p-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gold-soft flex items-center justify-center text-gold-strong shrink-0">
                <Icone size={17} />
              </div>
              {emEdicao ? (
                <input className="field-input flex-1" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} autoFocus />
              ) : (
                <span className="flex-1 text-sm font-medium flex items-center gap-1.5">
                  {c.nome}
                  {c.somente_ih && <span className="text-[9px] px-1.5 py-0.5 rounded font-medium bg-teal-soft text-teal">IH</span>}
                  {c.categoria_pareada_id && (
                    <span className="text-[10px] text-muted">
                      ↔ {categorias.find((x) => x.id === c.categoria_pareada_id)?.nome}
                    </span>
                  )}
                </span>
              )}
              {emEdicao && (
                <div className="flex items-center gap-2 shrink-0">
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input type="checkbox" checked={somenteIhEdicao} onChange={(e) => setSomenteIhEdicao(e.target.checked)} /> IH
                  </label>
                  <select
                    className="field-input text-xs py-1.5 w-32"
                    value={pareadaEdicao}
                    onChange={(e) => setPareadaEdicao(e.target.value)}
                    title="Categoria pareada — compartilha o cadastro de modelos"
                  >
                    <option value="">Sem par</option>
                    {categorias.filter((x) => x.id !== c.id).map((x) => (
                      <option key={x.id} value={x.id}>↔ {x.nome}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex items-center gap-1.5 shrink-0">
                {emEdicao ? (
                  <>
                    <button className="btn-primary text-xs px-2 py-1.5" onClick={() => salvarEdicao(c.id)}>Salvar</button>
                    <button className="btn text-xs px-2 py-1.5" onClick={() => setEditando(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="text-muted hover:text-gold transition p-1.5" title="Editar" onClick={() => { setEditando(c.id); setNomeEdicao(c.nome); setSomenteIhEdicao(c.somente_ih || false); setPareadaEdicao(c.categoria_pareada_id || ""); }}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn text-danger px-2 py-1.5" title="Excluir" onClick={() => excluir(c)}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CategoriasPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
