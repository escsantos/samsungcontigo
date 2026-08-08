"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase, loginParaEmail } from "../../lib/supabaseClient";
import BotaoTema from "../../components/BotaoTema";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("bloqueado") === "1") {
      setErro("Seu acesso foi bloqueado. Fale com o Administrador do sistema.");
    }
  }, [params]);

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginParaEmail(login),
      password: senha
    });
    if (error) {
      setCarregando(false);
      setErro("Login ou senha inválidos.");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data: perfil } = await supabase.from("perfis").select("bloqueado").eq("id", user.id).single();
    if (perfil?.bloqueado) {
      await supabase.auth.signOut();
      setCarregando(false);
      setErro("Seu acesso foi bloqueado. Fale com o Administrador do sistema.");
      return;
    }

    router.push("/pecas");
  }

  return (
    <div className="h-screen overflow-hidden flex bg-canvas">
      <div className="hidden lg:flex flex-1 flex-col bg-surface relative">
        <div className="px-10 pt-6">
          <p className="text-[11px] tracking-[0.15em] text-muted uppercase font-display font-semibold">
            Consulta de Peças — Custo &amp; Orçamento
          </p>
        </div>

        <div className="flex-1 flex items-center justify-center gap-10 px-12">
          <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo Eletrônica" className="max-w-[240px] h-auto" />
          <div className="w-1.5 h-40 rounded-full" style={{ background: "linear-gradient(180deg, #1B4162, #6FA8E1)" }} />
          <img src="/logos/grupo-macedo-maschetti.png" alt="Grupo Macedo &amp; Maschetti" className="max-w-[240px] h-auto" />
        </div>
      </div>

      <div className="w-full lg:w-[440px] bg-canvas flex items-center justify-center p-8 relative">
        <BotaoTema className="absolute top-6 right-6" />
        <form onSubmit={entrar} className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo Eletrônica" className="h-14 w-auto" />
          </div>

          <h1 className="font-display text-xl font-semibold text-ink mb-1">Entrar</h1>
          <p className="text-sm text-muted mb-6">Use seu login no padrão nome.sobrenome</p>

          <div className="mb-4">
            <label className="field-label">Login</label>
            <input
              className="field-input"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="samara.oliveira"
              autoFocus
            />
          </div>
          <div className="mb-5">
            <label className="field-label">Senha</label>
            <div className="relative">
              <input
                className="field-input pr-10"
                type={mostrarSenha ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
              >
                {mostrarSenha ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {erro && (
            <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>
          )}

          <button className="btn-primary w-full" type="submit" disabled={carregando}>
            {carregando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
