"use client";
import { useEffect, useState } from "react";
import { UserPlus, KeyRound, Lock, Unlock, Trash2, ShieldAlert } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { CARGOS } from "../../../lib/usuarios";
import AppShell from "../../../components/AppShell";
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
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [erro, setErro] = useState("");

  const [modalNovo, setModalNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [cargoNovo, setCargoNovo] = useState("Vendedor");
  const [criando, setCriando] = useState(false);

  const [confirmar, setConfirmar] = useState(null); // { tipo: 'resetar'|'excluir', usuario }
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [credenciais, setCredenciais] = useState(null);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      await recarregar();
    })();
  }, []);

  async function recarregar() {
    setCarregandoLista(true);
    const { data, error } = await supabase.from("perfis").select("*").order("nome");
    if (!error) setLista(data || []);
    setCarregandoLista(false);
  }

  async function criarUsuario() {
    setErro("");
    setCriando(true);
    try {
      const res = await chamarApi("/api/usuarios", {
        method: "POST",
        body: JSON.stringify({ nome, sobrenome, cargo: cargoNovo })
      });
      setModalNovo(false);
      setNome("");
      setSobrenome("");
      setCargoNovo("Vendedor");
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
        <p className="text-sm text-muted">{lista.length} usuário(s) cadastrado(s)</p>
        <button className="btn-primary" onClick={() => setModalNovo(true)}>
          <UserPlus size={16} />
          Novo usuário
        </button>
      </div>

      {erro && <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <div className="card overflow-hidden">
        {carregandoLista ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Nome</th>
                <th className="text-left px-4 py-2.5">Login</th>
                <th className="text-left px-4 py-2.5">Cargo</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-2.5 font-medium">{u.nome}</td>
                  <td className="px-4 py-2.5 font-mono text-muted">{u.login}</td>
                  <td className="px-4 py-2.5">
                    <select
                      className="field-input py-1.5 text-xs w-36"
                      value={u.cargo}
                      onChange={(e) => mudarCargo(u, e.target.value)}
                    >
                      {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
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
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
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
