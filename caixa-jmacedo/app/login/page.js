"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase, loginParaEmail } from "../../lib/supabaseClient";

export default function LoginPage() {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [mostrarEsqueci, setMostrarEsqueci] = useState(false);
  const [loginEsqueci, setLoginEsqueci] = useState("");
  const [enviandoEsqueci, setEnviandoEsqueci] = useState(false);
  const [pedidoEnviado, setPedidoEnviado] = useState(false);
  const router = useRouter();

  async function enviarPedidoSenha(e) {
    e.preventDefault();
    setEnviandoEsqueci(true);
    await supabase.from("solicitacoes_senha").insert({ login: loginEsqueci.trim().toLowerCase() });
    setEnviandoEsqueci(false);
    setPedidoEnviado(true);
  }

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginParaEmail(login),
      password: senha,
    });
    setCarregando(false);
    if (error) {
      setErro("Login ou senha inválidos.");
      return;
    }
    router.push("/dashboard/valores-diario");
  }

  return (
    <div data-theme="claro" className="h-screen overflow-hidden flex bg-white">
      {/* lado esquerdo — identidade, fundo branco, logos grandes */}
      <div className="hidden lg:flex flex-1 flex-col bg-white relative overflow-hidden">
        <div className="absolute top-7 left-10 z-10">
          <p className="text-[10px] font-semibold tracking-[0.25em] text-muted uppercase mb-1">Sistema</p>
          <p className="font-display text-lg font-semibold tracking-tight" style={{ color: "#16324F" }}>
            Controle de Orçamentos <span className="text-muted font-medium">(OW) — Balcão</span>
          </p>
        </div>

        <div className="flex-1 flex flex-row items-center justify-center gap-14 px-10 min-h-0">
          <img
            src="/logos/grupo-jmacedo.png"
            alt="Grupo J.Macedo Eletrônica"
            className="w-auto max-w-[45%] object-contain"
            style={{ maxHeight: "56vh" }}
          />
          <img
            src="/logos/grupo-macedo-maschetti.png"
            alt="Grupo Macedo & Maschetti"
            className="w-auto max-w-[45%] object-contain"
            style={{ maxHeight: "56vh" }}
          />
        </div>
      </div>

      {/* lado direito — formulário sobre degradê azul da marca */}
      <div className="w-full lg:w-[440px] gradiente-marca flex items-center justify-center p-8">
        <form onSubmit={entrar} className="w-full max-w-sm bg-white rounded-xl2 shadow-2xl p-8">
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
                tabIndex={-1}
                title={mostrarSenha ? "Esconder senha" : "Mostrar senha"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition"
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

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-xs text-muted hover:text-gold transition underline"
              onClick={() => { setMostrarEsqueci((v) => !v); setPedidoEnviado(false); setLoginEsqueci(login); }}
            >
              Esqueci minha senha
            </button>
          </div>

          {mostrarEsqueci && (
            <div className="mt-3 rounded-lg border border-line p-3">
              {pedidoEnviado ? (
                <p className="text-sm text-teal">
                  Pedido enviado! O administrador, gerente ou supervisor da sua unidade vai receber o aviso e redefinir sua senha.
                </p>
              ) : (
                <form onSubmit={enviarPedidoSenha} className="space-y-2">
                  <p className="text-xs text-muted">Informe seu login — vamos avisar quem pode redefinir sua senha.</p>
                  <input
                    className="field-input"
                    value={loginEsqueci}
                    onChange={(e) => setLoginEsqueci(e.target.value)}
                    placeholder="nome.sobrenome"
                    required
                  />
                  <button className="btn-primary w-full text-sm" type="submit" disabled={enviandoEsqueci}>
                    {enviandoEsqueci ? "Enviando…" : "Solicitar redefinição"}
                  </button>
                </form>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
