"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Lock, Unlock, Trash2, ShieldAlert, ShieldCheck, ShieldX, Save, Check } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../../lib/supabaseClient";
import { CARGOS } from "../../../../lib/usuarios";
import { calcularCompletude, permissoesAtivas } from "../../../../lib/perfilUtils";
import AppShell from "../../../../components/AppShell";
import Avatar from "../../../../components/Avatar";
import Modal from "../../../../components/Modal";
import CredenciaisModal from "../../../../components/CredenciaisModal";

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

export default function DetalheUsuarioPage() {
  const { id } = useParams();
  const router = useRouter();
  const [gestor, setGestor] = useState(undefined);
  const [usuario, setUsuario] = useState(undefined);
  const [nomeEditado, setNomeEditado] = useState("");
  const [cargoEditado, setCargoEditado] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [processando, setProcessando] = useState(false);
  const [credenciais, setCredenciais] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      setGestor(await getPerfilAtual());
      const { data } = await supabase.from("perfis").select("*").eq("id", id).single();
      setUsuario(data);
      setNomeEditado(data?.nome || "");
      setCargoEditado(data?.cargo || "");
    })();
  }, [id]);

  const houveMudanca = usuario && (nomeEditado !== usuario.nome || cargoEditado !== usuario.cargo);

  async function salvarAlteracoes() {
    if (!nomeEditado.trim()) {
      setErro("O nome não pode ficar em branco.");
      return;
    }
    setErro("");
    setSalvando(true);
    const { error } = await supabase
      .from("perfis")
      .update({ nome: nomeEditado.trim(), cargo: cargoEditado })
      .eq("id", id);
    setSalvando(false);
    if (error) {
      setErro("Não consegui salvar: " + error.message);
      return;
    }
    setUsuario((u) => ({ ...u, nome: nomeEditado.trim(), cargo: cargoEditado }));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  async function alternarBloqueio() {
    await supabase.from("perfis").update({ bloqueado: !usuario.bloqueado }).eq("id", id);
    setUsuario((u) => ({ ...u, bloqueado: !u.bloqueado }));
  }

  async function confirmarAcao() {
    if (!confirmar) return;
    setProcessando(true);
    try {
      if (confirmar.tipo === "resetar") {
        const res = await chamarApi(`/api/usuarios/${id}/resetar-senha`, { method: "POST" });
        setCredenciais(res);
      } else if (confirmar.tipo === "excluir") {
        await chamarApi(`/api/usuarios/${id}`, { method: "DELETE" });
        router.replace("/configuracoes/usuarios");
        return;
      }
      setConfirmar(null);
    } catch (e) {
      setErro(e.message);
      setConfirmar(null);
    }
    setProcessando(false);
  }

  if (gestor === undefined || usuario === undefined) {
    return <AppShell titulo="Usuário"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (gestor && !["Administrador", "Diretor", "Gerente"].includes(gestor.cargo)) {
    return (
      <AppShell titulo="Usuário">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor e Gerente podem ver esta página.</p>
        </div>
      </AppShell>
    );
  }

  if (!usuario) {
    return (
      <AppShell titulo="Usuário">
        <p className="text-sm text-muted">Usuário não encontrado.</p>
      </AppShell>
    );
  }

  const completude = calcularCompletude(usuario);
  const permissoes = permissoesAtivas(usuario.cargo);

  return (
    <AppShell titulo="Usuário">
      <button
        onClick={() => router.push("/configuracoes/usuarios")}
        className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4"
      >
        <ArrowLeft size={15} />
        Voltar para Usuários
      </button>

      <div className="max-w-2xl space-y-4">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Avatar nome={usuario.nome} fotoUrl={usuario.foto_url} tamanho={64} />
              <div>
                <p className="text-sm text-muted font-mono">{usuario.login}</p>
                <span
                  className="inline-block mt-1 text-[10.5px] font-mono font-bold px-2 py-0.5 rounded"
                  style={{
                    background: usuario.bloqueado ? "var(--danger-soft)" : "rgba(63,167,150,0.14)",
                    color: usuario.bloqueado ? "var(--danger)" : "#2C7C6E"
                  }}
                >
                  {usuario.bloqueado ? "Bloqueado" : "Ativo"}
                </span>
              </div>
            </div>
            <div className="flex gap-1.5">
              <button title="Resetar senha" onClick={() => setConfirmar({ tipo: "resetar" })} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas">
                <KeyRound size={16} />
              </button>
              <button title={usuario.bloqueado ? "Desbloquear" : "Bloquear"} onClick={alternarBloqueio} className="w-9 h-9 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas">
                {usuario.bloqueado ? <Unlock size={16} /> : <Lock size={16} />}
              </button>
              <button title="Excluir" onClick={() => setConfirmar({ tipo: "excluir" })} className="w-9 h-9 flex items-center justify-center rounded-lg text-danger hover:bg-danger-soft">
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Nome</label>
              <input className="field-input" value={nomeEditado} onChange={(e) => setNomeEditado(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Cargo</label>
              <select className="field-input" value={cargoEditado} onChange={(e) => setCargoEditado(e.target.value)}>
                {CARGOS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {erro && <div className="mt-3 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
          {salvo && (
            <div className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: "#2C7C6E" }}>
              <Check size={14} /> Alterações salvas!
            </div>
          )}

          <button
            className="btn-primary mt-4"
            disabled={!houveMudanca || salvando}
            onClick={salvarAlteracoes}
          >
            <Save size={15} />
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted mb-1.5">
              <span>Cadastro preenchido</span>
              <span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{completude}%</span>
            </div>
            <div className="h-2 bg-canvas rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${completude}%`, background: "var(--accent)" }} />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <p className="font-display font-semibold text-[15px] mb-4">Dados de contato</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted mb-0.5">E-mail</p>
              <p>{usuario.email || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Telefone</p>
              <p>{usuario.telefone || "—"}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <p className="font-display font-semibold text-[15px] mb-4">Permissões ativas</p>
          <div className="space-y-2">
            {permissoes.map((p) => (
              <div key={p.label} className="flex items-center gap-2 text-sm">
                {p.ativo ? <ShieldCheck size={16} style={{ color: "#2C7C6E" }} /> : <ShieldX size={16} className="text-muted" />}
                <span className={p.ativo ? "" : "text-muted"}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {erro && <div className="max-w-2xl mt-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <Modal
        open={!!confirmar}
        onClose={() => setConfirmar(null)}
        title={confirmar?.tipo === "excluir" ? "Excluir usuário?" : "Resetar senha?"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmar(null)}>Cancelar</button>
            <button className="btn-primary" disabled={processando} onClick={confirmarAcao}>
              {processando ? "Processando..." : "Confirmar"}
            </button>
          </>
        }
      >
        {confirmar?.tipo === "excluir" ? (
          <p className="text-sm text-muted">Isso vai excluir permanentemente o login de <b>{usuario.nome}</b>. Essa ação não pode ser desfeita.</p>
        ) : (
          <p className="text-sm text-muted">A senha de <b>{usuario.nome}</b> vai voltar para a senha inicial padrão.</p>
        )}
      </Modal>

      <CredenciaisModal dados={credenciais} onClose={() => setCredenciais(null)} />
    </AppShell>
  );
}
