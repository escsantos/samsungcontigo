"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "../../lib/supabaseClient";

export default function TrocarSenhaPage() {
  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) router.replace("/login");
    })();
  }, [router]);

  async function trocar(e) {
    e.preventDefault();
    setErro("");

    if (novaSenha.length < 6) {
      setErro("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (novaSenha !== confirmar) {
      setErro("A confirmação não bate com a nova senha.");
      return;
    }
    if (novaSenha === "samsungcontigo001") {
      setErro("Escolha uma senha diferente da senha inicial.");
      return;
    }

    setCarregando(true);
    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) {
      setCarregando(false);
      setErro("Não consegui trocar a senha: " + error.message);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("perfis").update({ senha_temporaria: false }).eq("id", user.id);

    setCarregando(false);
    router.push("/pecas");
  }

  return (
    <div className="h-screen flex items-center justify-center bg-canvas p-6">
      <form onSubmit={trocar} className="card p-8 w-full max-w-sm">
        <p className="font-display font-semibold text-xl mb-1">Troque sua senha</p>
        <p className="text-sm text-muted mb-6">
          Este é seu primeiro acesso. Por segurança, escolha uma senha nova antes de continuar.
        </p>

        <div className="mb-4">
          <label className="field-label">Nova senha</label>
          <div className="relative">
            <input
              className="field-input pr-10"
              type={mostrar ? "text" : "password"}
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setMostrar((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="mb-5">
          <label className="field-label">Confirmar nova senha</label>
          <input
            className="field-input"
            type={mostrar ? "text" : "password"}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
          />
        </div>

        {erro && <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

        <button className="btn-primary w-full" type="submit" disabled={carregando}>
          {carregando ? "Salvando..." : "Trocar senha e continuar"}
        </button>
      </form>
    </div>
  );
}
