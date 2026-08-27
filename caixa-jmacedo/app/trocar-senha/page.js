"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import LogoJMacedo from "../../components/LogoJMacedo";

export default function TrocarSenhaPage() {
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const router = useRouter();

  async function salvar(e) {
    e.preventDefault();
    setErro("");
    if (novaSenha.length < 8) {
      setErro("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmacao) {
      setErro("As senhas não conferem.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({
      password: novaSenha,
      data: { requer_troca_senha: false },
    });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    router.push("/dashboard/valores-diario");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas p-6">
      <form onSubmit={salvar} className="card w-full max-w-sm p-8">
        <LogoJMacedo variant="escuro" className="h-8 w-auto mb-6" />
        <h1 className="font-display text-xl font-semibold text-ink mb-1">Defina sua senha</h1>
        <p className="text-sm text-muted mb-6">Este é o seu primeiro acesso (ou uma redefinição). Escolha uma nova senha.</p>

        <div className="mb-4">
          <label className="field-label">Nova senha</label>
          <input className="field-input" type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
        </div>
        <div className="mb-5">
          <label className="field-label">Confirmar nova senha</label>
          <input className="field-input" type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
        </div>

        {erro && <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

        <button className="btn-primary w-full" type="submit" disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar e continuar"}
        </button>
      </form>
    </div>
  );
}
