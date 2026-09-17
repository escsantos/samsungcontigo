"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, Check, ShieldCheck, ShieldX } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import Avatar from "../../components/Avatar";
import { redimensionarImagem, calcularCompletude, permissoesAtivas } from "../../lib/perfilUtils";

export default function MeuPerfilPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");
  const inputFotoRef = useRef(null);

  useEffect(() => {
    (async () => {
      const p = await getPerfilAtual();
      setPerfil(p);
      setEmail(p?.email || "");
      setTelefone(p?.telefone || "");
    })();
  }, []);

  async function salvarDados() {
    setErro("");
    setMensagem("");
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("perfis").update({ email, telefone }).eq("id", user.id);
    setSalvando(false);
    if (error) {
      setErro("Não consegui salvar: " + error.message);
      return;
    }
    setMensagem("Dados salvos!");
    setPerfil((p) => ({ ...p, email, telefone }));
    setTimeout(() => setMensagem(""), 2500);
  }

  async function trocarFoto(e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro("");
    setEnviandoFoto(true);
    try {
      const blob = await redimensionarImagem(arquivo);
      const { data: { user } } = await supabase.auth.getUser();
      const caminho = `${user.id}/foto.jpg`;
      const { error: errUpload } = await supabase.storage
        .from("avatars")
        .upload(caminho, blob, { upsert: true, contentType: "image/jpeg" });
      if (errUpload) throw errUpload;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(caminho);
      const fotoUrl = `${pub.publicUrl}?v=${Date.now()}`;
      const { error: errPerfil } = await supabase.from("perfis").update({ foto_url: fotoUrl }).eq("id", user.id);
      if (errPerfil) throw errPerfil;
      setPerfil((p) => ({ ...p, foto_url: fotoUrl }));
    } catch (e) {
      setErro("Falha ao enviar a foto: " + e.message);
    }
    setEnviandoFoto(false);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Meu Perfil"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  const completude = calcularCompletude(perfil);
  const permissoes = permissoesAtivas(perfil?.cargo);

  return (
    <AppShell titulo="Meu Perfil">
      <div className="max-w-2xl space-y-4">
        <div className="card p-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar nome={perfil?.nome} fotoUrl={perfil?.foto_url} tamanho={72} />
              <button
                onClick={() => inputFotoRef.current?.click()}
                disabled={enviandoFoto}
                title="Trocar foto"
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-surface border border-line flex items-center justify-center text-muted hover:text-ink shadow"
              >
                <Camera size={13} />
              </button>
              <input ref={inputFotoRef} type="file" accept="image/*" className="hidden" onChange={trocarFoto} />
            </div>
            <div>
              <p className="font-display font-semibold text-lg">{perfil?.nome}</p>
              <p className="text-sm text-muted font-mono">{perfil?.login}</p>
              <p className="text-xs text-muted mt-0.5">{perfil?.cargo}</p>
            </div>
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-xs text-muted mb-1.5">
              <span>Cadastro preenchido</span>
              <span className="font-mono font-semibold" style={{ color: "var(--accent)" }}>{completude}%</span>
            </div>
            <div className="h-2 bg-canvas rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${completude}%`, background: "var(--accent)" }} />
            </div>
            {completude < 100 && (
              <p className="text-[11px] text-muted mt-1.5">Complete seu e-mail e telefone para chegar a 100%.</p>
            )}
          </div>
        </div>

        <div className="card p-6">
          <p className="font-display font-semibold text-[15px] mb-4">Dados de contato</p>
          <div className="space-y-3">
            <div>
              <label className="field-label">E-mail</label>
              <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seuemail@exemplo.com" />
            </div>
            <div>
              <label className="field-label">Telefone</label>
              <input className="field-input" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          </div>

          {erro && <div className="mt-3 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
          {mensagem && (
            <div className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: "#2C7C6E" }}>
              <Check size={14} /> {mensagem}
            </div>
          )}

          <button className="btn-primary mt-4" onClick={salvarDados} disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar dados"}
          </button>
        </div>

        <div className="card p-6">
          <p className="font-display font-semibold text-[15px] mb-1">Permissões ativas</p>
          <p className="text-xs text-muted mb-4">Definidas automaticamente pelo seu cargo ({perfil?.cargo}).</p>
          <div className="space-y-2">
            {permissoes.map((p) => (
              <div key={p.label} className="flex items-center gap-2 text-sm">
                {p.ativo ? (
                  <ShieldCheck size={16} style={{ color: "#2C7C6E" }} />
                ) : (
                  <ShieldX size={16} className="text-muted" />
                )}
                <span className={p.ativo ? "" : "text-muted"}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
