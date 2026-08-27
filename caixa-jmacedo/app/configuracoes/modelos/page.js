"use client";
import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Upload, Check, X, Inbox } from "lucide-react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeConfigModelos, podeConfigTiposServico } from "../../../lib/permissions";

function Conteudo() {
  const { usuario } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [nomeModelo, setNomeModelo] = useState("");
  const [editando, setEditando] = useState(null);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [importando, setImportando] = useState(false);
  const [resumoImportacao, setResumoImportacao] = useState(null);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const inputArquivoRef = useRef(null);

  async function carregar() {
    const { data: c } = await supabase.from("categorias").select("*").order("nome");
    setCategorias(c || []);
    const { data: m } = await supabase.from("modelos").select("*, categorias(nome)").order("nome");
    setModelos(m || []);
    const { data: s } = await supabase
      .from("solicitacoes_modelo")
      .select("*, categorias(nome), unidades(nome), usuarios!solicitado_por(nome_completo)")
      .eq("status", "pendente")
      .order("criado_em", { ascending: false });
    setSolicitacoes(s || []);
  }

  async function aprovarSolicitacao(s) {
    const { data: novoModelo, error } = await supabase.from("modelos").insert({ categoria_id: s.categoria_id, nome: s.nome }).select().single();
    if (error) {
      alert("Erro ao aprovar: " + error.message);
      return;
    }
    await supabase
      .from("solicitacoes_modelo")
      .update({ status: "aprovado", resolvido_por: usuario.id, resolvido_em: new Date().toISOString() })
      .eq("id", s.id);
    carregar();
  }

  async function rejeitarSolicitacao(s) {
    if (!window.confirm(`Rejeitar o pedido de "${s.nome}"?`)) return;
    await supabase
      .from("solicitacoes_modelo")
      .update({ status: "rejeitado", resolvido_por: usuario.id, resolvido_em: new Date().toISOString() })
      .eq("id", s.id);
    carregar();
  }

  useEffect(() => {
    carregar();
  }, []);

  async function salvarModelo(e) {
    e.preventDefault();
    const { data, error } = await supabase.from("modelos").insert({ categoria_id: categoriaId, nome: nomeModelo.toUpperCase() }).select();
    if (error) {
      alert("Erro ao salvar: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      alert("Não foi possível salvar — você não tem permissão para esta ação.");
      return;
    }
    setNomeModelo("");
    carregar();
  }

  async function salvarEdicao(id) {
    const { data, error } = await supabase.from("modelos").update({ nome: nomeEdicao.toUpperCase() }).eq("id", id).select();
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

  async function excluir(m) {
    const { count } = await supabase.from("lancamentos").select("id", { count: "exact", head: true }).eq("modelo_id", m.id);
    if (count > 0) {
      alert(`Não é possível excluir "${m.nome}" — já foi usado em ${count} lançamento(s).`);
      return;
    }
    if (!window.confirm(`Excluir o modelo "${m.nome}"?`)) return;
    const { data, error } = await supabase.from("modelos").delete().eq("id", m.id).select();
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

  async function aoEscolherArquivo(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setImportando(true);
    setResumoImportacao(null);

    try {
      const XLSX = await import("xlsx");
      const buffer = await arquivo.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const planilha = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(planilha, { defval: "" });

      // normaliza: aceita "Modelo"/"MODELO" e "Categoria"/"CATEGORIAS"
      const registros = linhas
        .map((l) => {
          const chaveModelo = Object.keys(l).find((k) => k.toLowerCase().includes("modelo"));
          const chaveCategoria = Object.keys(l).find((k) => k.toLowerCase().includes("categoria"));
          return {
            modelo: String(l[chaveModelo] || "").trim().toUpperCase(),
            categoria: String(l[chaveCategoria] || "").trim(),
          };
        })
        .filter((r) => r.modelo && r.categoria);

      if (registros.length === 0) {
        alert('Não encontrei dados válidos. A planilha precisa ter as colunas "Modelo" e "Categoria".');
        setImportando(false);
        return;
      }

      // categorias novas que não existem ainda
      const categoriasExistentes = new Map(categorias.map((c) => [c.nome.toLowerCase(), c]));
      const categoriasNovasNomes = [...new Set(registros.map((r) => r.categoria))].filter(
        (nome) => !categoriasExistentes.has(nome.toLowerCase())
      );

      let categoriasParaCriar = [];
      if (categoriasNovasNomes.length > 0) {
        const confirmar = window.confirm(
          `A planilha tem ${categoriasNovasNomes.length} categoria(s) que ainda não existem no cadastro:\n\n${categoriasNovasNomes.join(", ")}\n\nDeseja cadastrá-las automaticamente?`
        );
        if (confirmar) {
          categoriasParaCriar = categoriasNovasNomes;
        } else {
          // ignora os modelos dessas categorias
        }
      }

      let mapaCategorias = new Map(categoriasExistentes);
      if (categoriasParaCriar.length > 0) {
        const { data: criadas, error } = await supabase
          .from("categorias")
          .insert(categoriasParaCriar.map((nome) => ({ nome })))
          .select();
        if (error) {
          alert("Erro ao criar categorias novas: " + error.message);
          setImportando(false);
          return;
        }
        criadas.forEach((c) => mapaCategorias.set(c.nome.toLowerCase(), c));
      }

      // busca modelos já existentes (categoria_id + nome) para não duplicar
      const { data: modelosExistentes } = await supabase.from("modelos").select("nome, categoria_id");
      const chavesExistentes = new Set((modelosExistentes || []).map((m) => `${m.categoria_id}::${m.nome.toUpperCase()}`));

      const jaVistos = new Set();
      const paraInserir = [];
      let ignoradosSemCategoria = 0;
      let ignoradosDuplicados = 0;

      registros.forEach((r) => {
        const cat = mapaCategorias.get(r.categoria.toLowerCase());
        if (!cat) {
          ignoradosSemCategoria++;
          return;
        }
        const chave = `${cat.id}::${r.modelo}`;
        if (chavesExistentes.has(chave) || jaVistos.has(chave)) {
          ignoradosDuplicados++;
          return;
        }
        jaVistos.add(chave);
        paraInserir.push({ categoria_id: cat.id, nome: r.modelo });
      });

      // insere em lotes de 500
      let inseridos = 0;
      for (let i = 0; i < paraInserir.length; i += 500) {
        const lote = paraInserir.slice(i, i + 500);
        const { error } = await supabase.from("modelos").insert(lote);
        if (error) {
          alert(`Erro ao importar: ${error.message}\n(${inseridos} modelo(s) já foram salvos antes do erro)`);
          break;
        }
        inseridos += lote.length;
      }

      setResumoImportacao({
        total: registros.length,
        inseridos,
        duplicados: ignoradosDuplicados,
        semCategoria: ignoradosSemCategoria,
        categoriasCriadas: categoriasParaCriar.length,
      });
      carregar();
    } catch (err) {
      alert("Erro ao ler a planilha: " + err.message);
    } finally {
      setImportando(false);
      if (inputArquivoRef.current) inputArquivoRef.current.value = "";
    }
  }

  const permitido = podeConfigModelos(usuario.cargo);
  const podeExcluirItem = podeConfigTiposServico(usuario.cargo);

  if (!permitido) {
    return <p className="text-sm text-muted">Somente Supervisão, Gerência, Administrador ou Diretor cadastram modelos.</p>;
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Modelos</h1>
          <p className="text-sm text-muted mt-1">{modelos.length} modelos cadastrados</p>
        </div>
        <div className="shrink-0">
          <input ref={inputArquivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={aoEscolherArquivo} />
          <button className="btn flex items-center gap-1.5" onClick={() => inputArquivoRef.current?.click()} disabled={importando}>
            <Upload size={14} /> {importando ? "Importando…" : "Importar planilha"}
          </button>
        </div>
      </div>

      {resumoImportacao && (
        <div className="card p-4 mb-6 text-sm bg-teal-soft/40 border-teal/30">
          <p className="font-medium text-teal mb-1">Importação concluída</p>
          <p className="text-muted">
            {resumoImportacao.total} linha(s) na planilha · <span className="text-ink font-medium">{resumoImportacao.inseridos} novo(s) modelo(s) criado(s)</span>
            {resumoImportacao.duplicados > 0 && ` · ${resumoImportacao.duplicados} já existiam (ignorados)`}
            {resumoImportacao.semCategoria > 0 && ` · ${resumoImportacao.semCategoria} sem categoria válida (ignorados)`}
            {resumoImportacao.categoriasCriadas > 0 && ` · ${resumoImportacao.categoriasCriadas} categoria(s) nova(s) criada(s)`}
          </p>
        </div>
      )}

      {solicitacoes.length > 0 && (
        <div className="card overflow-hidden mb-6 border-gold/40">
          <div className="px-4 py-3 border-b border-line bg-gold-soft/40 flex items-center gap-2">
            <Inbox size={15} className="text-gold-strong" />
            <p className="font-display text-sm font-semibold text-ink">Solicitações de novo modelo</p>
            <span className="text-xs text-muted">({solicitacoes.length} pendente(s))</span>
          </div>
          <div className="divide-y divide-line">
            {solicitacoes.map((s) => (
              <div key={s.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{s.nome} <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded ml-1">{s.categorias?.nome}</span></p>
                  <p className="text-xs text-muted mt-0.5">
                    Pedido por {s.usuarios?.nome_completo || "—"}{s.unidades?.nome && ` · ${s.unidades.nome}`} · {new Date(s.criado_em).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="btn text-xs px-2 py-1.5 text-teal border-teal/30 hover:bg-teal-soft flex items-center gap-1" onClick={() => aprovarSolicitacao(s)}>
                    <Check size={13} /> Aprovar
                  </button>
                  <button className="btn text-xs px-2 py-1.5 text-danger border-danger/30 hover:bg-danger-soft flex items-center gap-1" onClick={() => rejeitarSolicitacao(s)}>
                    <X size={13} /> Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted mb-6 -mt-2">
        A planilha precisa ter as colunas <span className="font-mono-num text-ink">Modelo</span> e{" "}
        <span className="font-mono-num text-ink">Categoria</span>. Modelos repetidos são ignorados automaticamente.
      </p>

      <form onSubmit={salvarModelo} className="card p-4 flex gap-3 mb-6 items-end">
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

      {(() => {
        const categoriaAtual = categorias.find((c) => c.id === categoriaId);
        const pareada = categoriaAtual ? categorias.find((c) => c.id === categoriaAtual.categoria_pareada_id) : null;
        return categoriaId && pareada ? (
          <p className="text-xs text-muted mb-3 -mt-3">
            Mostrando também os modelos de <span className="font-medium text-ink">{pareada.nome}</span> — as duas categorias compartilham o mesmo cadastro.
          </p>
        ) : null;
      })()}

      <div className="card divide-y divide-line max-h-[520px] overflow-y-auto">
        {modelos
          .filter((m) => {
            if (!categoriaId) return true;
            const categoriaAtual = categorias.find((c) => c.id === categoriaId);
            const idsValidos = [categoriaId, categoriaAtual?.categoria_pareada_id].filter(Boolean);
            return idsValidos.includes(m.categoria_id);
          })
          .map((m) => (
          <div key={m.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            {editando === m.id ? (
              <input className="field-input flex-1" value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} autoFocus />
            ) : (
              <span>{m.nome}</span>
            )}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{m.categorias?.nome}</span>
              {editando !== m.id && (
                <button className="text-muted hover:text-gold transition" title="Alterar" onClick={() => { setEditando(m.id); setNomeEdicao(m.nome); }}>
                  <Pencil size={14} />
                </button>
              )}
              {editando === m.id && (
                <>
                  <button className="btn-primary text-xs px-2 py-1.5" onClick={() => salvarEdicao(m.id)}>Salvar</button>
                  <button className="btn text-xs px-2 py-1.5" onClick={() => setEditando(null)}>Cancelar</button>
                </>
              )}
              {podeExcluirItem && editando !== m.id && (
                <button className="text-muted hover:text-danger transition" title="Excluir" onClick={() => excluir(m)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ModelosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
