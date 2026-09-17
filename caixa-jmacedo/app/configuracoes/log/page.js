"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { podeVerLogAuditoria, podeVerTodasUnidades } from "../../../lib/permissions";

const ROTULO_ACAO = { insert: "Criação", update: "Alteração", delete: "Exclusão" };
const ROTULO_TABELA = { lancamentos: "Lançamento", metas: "Meta", tipos_servico: "Tipo de serviço" };

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const [registros, setRegistros] = useState([]);
  const [usuariosMap, setUsuariosMap] = useState({});
  const [unidadesMap, setUnidadesMap] = useState({});
  const [carregando, setCarregando] = useState(true);

  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");

  useEffect(() => {
    if (!podeVerLogAuditoria(usuario.cargo)) return;
    (async () => {
      let query = supabase.from("log_auditoria").select("*").order("criado_em", { ascending: false }).limit(500);
      if (!podeVerTodasUnidades(usuario.cargo)) {
        query = query.in("unidade_id", unidades.map((u) => u.id));
      }
      const { data } = await query;
      setRegistros(data || []);

      const { data: us } = await supabase.from("usuarios").select("id, nome_completo");
      setUsuariosMap(Object.fromEntries((us || []).map((u) => [u.id, u.nome_completo])));
      const { data: uns } = await supabase.from("unidades").select("id, nome");
      setUnidadesMap(Object.fromEntries((uns || []).map((u) => [u.id, u.nome])));

      setCarregando(false);
    })();
  }, [usuario, unidades]);

  if (!podeVerLogAuditoria(usuario.cargo)) {
    return <p className="text-sm text-muted">Somente Gerência, Administrador ou Diretor acessam o log do sistema.</p>;
  }

  const filtrados = registros.filter((r) => {
    if (filtroUsuario && r.usuario_id !== filtroUsuario) return false;
    if (filtroUnidade && r.unidade_id !== filtroUnidade) return false;
    if (filtroAcao && r.acao !== filtroAcao) return false;
    return true;
  });

  const usuariosNoLog = [...new Set(registros.map((r) => r.usuario_id).filter(Boolean))];
  const unidadesNoLog = [...new Set(registros.map((r) => r.unidade_id).filter(Boolean))];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Log do sistema</h1>
        <p className="text-sm text-muted mt-1">
          {podeVerTodasUnidades(usuario.cargo) ? "Todas as unidades" : "Unidades sob sua gerência"} · últimos 500 registros
        </p>
      </div>

      <div className="card p-4 grid grid-cols-3 gap-3 mb-5">
        <div>
          <label className="field-label">Usuário</label>
          <select className="field-input" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
            <option value="">Todos</option>
            {usuariosNoLog.map((id) => (
              <option key={id} value={id}>{usuariosMap[id] || id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Unidade</label>
          <select className="field-input" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
            <option value="">Todas</option>
            {unidadesNoLog.map((id) => (
              <option key={id} value={id}>{unidadesMap[id] || id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="field-label">Ação</label>
          <select className="field-input" value={filtroAcao} onChange={(e) => setFiltroAcao(e.target.value)}>
            <option value="">Todas</option>
            <option value="insert">Criação</option>
            <option value="update">Alteração</option>
            <option value="delete">Exclusão</option>
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Data/hora</td>
              <td className="p-3">Usuário</td>
              <td className="p-3">Unidade</td>
              <td className="p-3">Ação</td>
              <td className="p-3">Onde</td>
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td className="p-4 text-muted" colSpan={5}>Carregando…</td></tr>}
            {!carregando && filtrados.length === 0 && <tr><td className="p-4 text-muted" colSpan={5}>Nenhum registro encontrado.</td></tr>}
            {filtrados.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="p-3 whitespace-nowrap font-mono-num text-xs">{new Date(r.criado_em).toLocaleString("pt-BR")}</td>
                <td className="p-3">{usuariosMap[r.usuario_id] || "—"}</td>
                <td className="p-3">{unidadesMap[r.unidade_id] || "—"}</td>
                <td className="p-3">{ROTULO_ACAO[r.acao] || r.acao}</td>
                <td className="p-3">{ROTULO_TABELA[r.tabela] || r.tabela}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LogPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
