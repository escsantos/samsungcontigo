"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, KeyRound, Lock, Unlock, Trash2, ShieldAlert, Pencil, Building2, Search } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { CARGOS } from "../../../lib/usuarios";
import AppShell from "../../../components/AppShell";
import Avatar from "../../../components/Avatar";
import Modal from "../../../components/Modal";
import CredenciaisModal from "../../../components/CredenciaisModal";

async function chamarApi(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.headers || {})
    }
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.erro || "Falha na operação.");
  return json;
}

export default function UsuariosPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erro, setErro] = useState("");

  const [modalNovo, setModalNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [cargoNovo, setCargoNovo] = useState("Vendedor");
  const [unidadesDisponiveis, setUnidadesDisponiveis] = useState([]);
  const [unidadesSelecionadas, setUnidadesSelecionadas] = useState([]);
  const [criando, setCriando] = useState(false);

  const [confirmar, setConfirmar] = useState(null); // { tipo: 'resetar'|'excluir', usuario }
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [credenciais, setCredenciais] = useState(null);

  const [buscaNome, setBuscaNome] = useState("");
  const [filtroCargo, setFiltroCargo] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [vinculosPorUsuario, setVinculosPorUsuario] = useState({}); // perfil_id -> [{id, nome}]

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      await recarregar();
      const { data: unidades } = await supabase.from("unidades").select("id, nome").eq("ativo", true).order("nome");
      setUnidadesDisponiveis(unidades || []);
    })();
  }, []);

  async function recarregar() {
    setCarregandoLista(true);
    const { data, error } = await supabase.from("perfis").select("*").order("nome");
    if (!error) setLista(data || []);

    const { data: vinculos } = await supabase.from("perfis_unidades").select("perfil_id, unidades(id, nome)");
    const mapa = {};
    (vinculos || []).forEach((v) => {
      if (!v.unidades) return;
      mapa[v.perfil_id] = [...(mapa[v.perfil_id] || []), v.unidades];
    });
    setVinculosPorUsuario(mapa);

    setCarregandoLista(false);
  }

  function alternarUnidadeSelecionada(id) {
    setUnidadesSelecionadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  async function criarUsuario() {
    setErro("");
    setCriando(true);
    try {
      const res = await chamarApi("/api/usuarios", {
        method: "POST",
        body: JSON.stringify({ nome, sobrenome, cargo: cargoNovo, unidadeIds: unidadesSelecionadas })
      });
      setModalNovo(false);
      setNome("");
      setSobrenome("");
      setCargoNovo("Vendedor");
      setUnidadesSelecionadas([]);
      await recarregar();
      setCredenciais(res);
    } catch (e) {
      setErro(e.message);
    }
    setCriando(false);
  }

  async function mudarCargo(usuario, novoCargo) {
    await supabase.from("perfis").update({ cargo: novoCargo }).eq("id", usuario.id);
    await recarregar();
  }

  async function alternarBloqueio(usuario) {
    await supabase.from("perfis").update({ bloqueado: !usuario.bloqueado }).eq("id", usuario.id);
    await recarregar();
  }

  async function confirmarAcao() {
    if (!confirmar) return;
    setProcessandoAcao(true);
    try {
      if (confirmar.tipo === "resetar") {
        const res = await chamarApi(`/api/usuarios/${confirmar.usuario.id}/resetar-senha`, { method: "POST" });
        setCredenciais(res);
      } else if (confirmar.tipo === "excluir") {
        await chamarApi(`/api/usuarios/${confirmar.usuario.id}`, { method: "DELETE" });
        await recarregar();
      }
      setConfirmar(null);
    } catch (e) {
      setErro(e.message);
      setConfirmar(null);
    }
    setProcessandoAcao(false);
  }

  const listaFiltrada = useMemo(() => {
    return lista.filter((u) => {
      if (buscaNome.trim() && !u.nome.toLowerCase().includes(buscaNome.trim().toLowerCase())) return false;
      if (filtroCargo && u.cargo !== filtroCargo) return false;
      if (filtroStatus === "ativo" && u.bloqueado) return false;
      if (filtroStatus === "bloqueado" && !u.bloqueado) return false;
      if (filtroUnidade) {
        const vinculos = vinculosPorUsuario[u.id] || [];
        if (!vinculos.some((v) => String(v.id) === filtroUnidade)) return false;
      }
      return true;
    });
  }, [lista, buscaNome, filtroCargo, filtroStatus, filtroUnidade, vinculosPorUsuario]);

  if (perfil === undefined) {
    return <AppShell titulo="Usuários"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Usuários">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor e Gerente podem gerenciar usuários.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Usuários">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted">{listaFiltrada.length} de {lista.length} usuário(s)</p>
        <button className="btn-primary" onClick={() => setModalNovo(true)}>
          <UserPlus size={16} />
          Novo usuário
        </button>
      </div>

      <div className="card p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="field-label">Buscar por nome</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="field-input pl-9" placeholder="Nome..." value={buscaNome} onChange={(e) => setBuscaNome(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Cargo</label>
            <select className="field-input" value={filtroCargo} onChange={(e) => setFiltroCargo(e.target.value)}>
              <option value="">Todos</option>
              {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Unidade</label>
            <select className="field-input" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
              <option value="">Todas</option>
              {unidadesDisponiveis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Status</label>
            <select className="field-input" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
              <option value="">Todos</option>
              <option value="ativo">Ativo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </div>
        </div>
      </div>

      {erro && <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <div className="card overflow-hidden">
        {carregandoLista ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : listaFiltrada.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum usuário encontrado com esses filtros.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Nome</th>
                <th className="text-left px-4 py-2.5">Login</th>
                <th className="text-left px-4 py-2.5">Cargo</th>
                <th className="text-left px-4 py-2.5">Unidade(s)</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                  onClick={() => router.push(`/configuracoes/usuarios/${u.id}`)}
                >
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2.5">
                      <Avatar nome={u.nome} fotoUrl={u.foto_url} tamanho={26} />
                      {u.nome}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted">{u.login}</td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <select
                      className="field-input py-1.5 text-xs w-36"
                      value={u.cargo}
                      onChange={(e) => mudarCargo(u, e.target.value)}
                    >
                      {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    {(vinculosPorUsuario[u.id] || []).length === 0 ? (
                      <span className="text-xs text-muted">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(vinculosPorUsuario[u.id] || []).map((v) => (
                          <span key={v.id} className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                            <Building2 size={9} />
                            {v.nome}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded"
                      style={{
                        background: u.bloqueado ? "var(--danger-soft)" : "rgba(63,167,150,0.14)",
                        color: u.bloqueado ? "var(--danger)" : "#2C7C6E"
                      }}
                    >
                      {u.bloqueado ? "Bloqueado" : "Ativo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1.5">
                      <button
                        title="Editar"
                        onClick={() => router.push(`/configuracoes/usuarios/${u.id}`)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        title="Resetar senha"
                        onClick={() => setConfirmar({ tipo: "resetar", usuario: u })}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas"
                      >
                        <KeyRound size={15} />
                      </button>
                      <button
                        title={u.bloqueado ? "Desbloquear" : "Bloquear"}
                        onClick={() => alternarBloqueio(u)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas"
                      >
                        {u.bloqueado ? <Unlock size={15} /> : <Lock size={15} />}
                      </button>
                      <button
                        title="Excluir"
                        onClick={() => setConfirmar({ tipo: "excluir", usuario: u })}
                        className="w-8 h-8 flex items-center justify-center rounded-lg text-danger hover:bg-danger-soft"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal: novo usuário */}
      <Modal
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        title="Novo usuário"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalNovo(false)}>Cancelar</button>
            <button className="btn-primary" disabled={!nome.trim() || !sobrenome.trim() || criando} onClick={criarUsuario}>
              {criando ? "Criando..." : "Criar usuário"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="field-label">Nome</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Samara" />
          </div>
          <div>
            <label className="field-label">Sobrenome</label>
            <input className="field-input" value={sobrenome} onChange={(e) => setSobrenome(e.target.value)} placeholder="Oliveira" />
          </div>
          <div>
            <label className="field-label">Cargo</label>
            <select className="field-input" value={cargoNovo} onChange={(e) => setCargoNovo(e.target.value)}>
              {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {unidadesDisponiveis.length > 0 && (
            <div>
              <label className="field-label flex items-center gap-1.5">
                <Building2 size={13} />
                Unidade(s)
              </label>
              <div className="space-y-1.5">
                {unidadesDisponiveis.map((u) => (
                  <label key={u.id} className="flex items-center gap-2 p-2 rounded-lg border border-line cursor-pointer text-sm">
                    <input type="checkbox" checked={unidadesSelecionadas.includes(u.id)} onChange={() => alternarUnidadeSelecionada(u.id)} />
                    {u.nome}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-1">
                {unidadesSelecionadas.length === 0
                  ? "Se nenhuma for marcada, esse login não vai conseguir entrar no sistema."
                  : unidadesSelecionadas.length === 1
                    ? "Só uma unidade marcada — o login entra direto nela, sem precisar escolher."
                    : "Mais de uma marcada — o login vai escolher a unidade ao entrar."}
              </p>
            </div>
          )}
          <p className="text-xs text-muted">
            Login gerado automaticamente (nome.sobrenome). Senha inicial: <span className="font-mono">samsungcontigo001</span>
          </p>
        </div>
      </Modal>

      {/* Modal: confirmação de ação */}
      <Modal
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        title={confirmar?.tipo === "excluir" ? "Excluir usuário?" : "Resetar senha?"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className="btn-primary" disabled={processandoAcao} onClick={confirmarAcao}>
              {processandoAcao ? "Processando..." : "Confirmar"}
            </button>
          </>
        }
      >
        {confirmar?.tipo === "excluir" ? (
          <p className="text-sm text-muted">
            Isso vai excluir permanentemente o login de <b>{confirmar?.usuario?.nome}</b>. Essa ação não pode ser desfeita.
          </p>
        ) : (
          <p className="text-sm text-muted">
            A senha de <b>{confirmar?.usuario?.nome}</b> vai voltar para a senha inicial padrão.
          </p>
        )}
      </Modal>

      <CredenciaisModal dados={credenciais} onClose={() => setCredenciais(null)} />
    </AppShell>
  );
}
