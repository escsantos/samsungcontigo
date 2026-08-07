"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase, loginParaEmail } from "../../lib/supabaseClient";
import BotaoTema from "../../components/BotaoTema";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const router = useRouter();

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginParaEmail(login),
      password: senha
    });
    setCarregando(false);
    if (error) {
      setErro("Login ou senha inválidos.");
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
            <input
              className="field-input"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
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
