"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { Check } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeCadastrarUsuarioOuUnidade, CARGOS, CARGO_LABELS, rotuloCargo } from "../../../lib/permissions";

function ConteudoUsuarios() {
  const { usuario } = useSessao();
  const [usuarios, setUsuarios] = useState([]);
  const [unidades, setUnidades] = useState([]);

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [cargo, setCargo] = useState(CARGOS.OPERACIONAL);
  const [unidadeIds, setUnidadeIds] = useState([]);

  async function carregar() {
    const { data: us } = await supabase.from("usuarios").select("*").order("nome_completo");
    setUsuarios(us || []);
    const { data: uns } = await supabase.from("unidades").select("*").order("nome");
    setUnidades(uns || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  function alternarUnidade(id) {
    setUnidadeIds((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
  }

  // A criação do login/senha no Supabase Auth precisa da service_role key,
  // que não roda no navegador por segurança — ver rota /api/criar-usuario.
  async function salvar(e) {
    e.preventDefault();
    const login = `${nome.toLowerCase()}.${sobrenome.toLowerCase()}`.replace(/\s/g, "");
    alert(
      `Pronto para criar: ${login} (${rotuloCargo(cargo)}), com acesso a ${unidadeIds.length} unidade(s). ` +
        `Ligue este formulário à rota /api/criar-usuario com a service_role key do Supabase para efetivar a criação do login.`
    );
  }

  const permitido = podeCadastrarUsuarioOuUnidade(usuario.cargo);
  if (!permitido) {
    return <p className="text-sm text-muted">Somente Administrador ou Diretor podem cadastrar usuários.</p>;
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Cadastros</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Usuários</h1>
        <p className="text-sm text-muted mt-1">{usuarios.length} usuários cadastrados</p>
      </div>

      <form onSubmit={salvar} className="card p-5 mb-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">Nome</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div>
            <label className="field-label">Sobrenome</label>
            <input className="field-input" value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} required />
          </div>
        </div>

        {nome && sobrenome && (
          <p className="text-xs text-muted">
            Login gerado: <span className="font-mono-num text-ink">{`${nome.toLowerCase()}.${sobrenome.toLowerCase()}`.replace(/\s/g, "")}</span>
          </p>
        )}

        <div>
          <label className="field-label">Cargo</label>
          <select className="field-input" value={cargo} onChange={(e) => setCargo(e.target.value)}>
            {Object.values(CARGOS).map((c) => (
              <option key={c} value={c}>{CARGO_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="field-label">Unidades autorizadas</label>
          <p className="text-xs text-muted mb-2">
            Marque uma ou mais lojas — útil para supervisores e gerentes que cuidam de várias unidades.
          </p>
          <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto pr-1">
            {unidades.map((u) => {
              const marcado = unidadeIds.includes(u.id);
              return (
                <label
                  key={u.id}
                  className={`checkbox-tile ${marcado ? "is-checked" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarUnidade(u.id)}
                    className="sr-only"
                  />
                  <span
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                      marcado ? "bg-gold border-gold" : "border-line bg-white"
                    }`}
                  >
                    {marcado && <Check size={12} strokeWidth={3} className="text-white" />}
                  </span>
                  <span className="truncate">{u.nome}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" type="submit">Criar usuário</button>
        </div>
      </form>

      <div className="card divide-y divide-line">
        {usuarios.map((u) => (
          <div key={u.id} className="p-3 flex justify-between text-sm">
            <span>{u.nome_completo} <span className="text-muted font-mono-num">· {u.login}</span></span>
            <span className="text-xs text-gold font-medium">{rotuloCargo(u.cargo)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CadastroUsuarios() {
  return (
    <AppShell>
      <ConteudoUsuarios />
    </AppShell>
  );
}
