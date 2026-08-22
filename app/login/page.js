"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase, loginParaEmail } from "../../lib/supabaseClient";
import { registrarAuditoria } from "../../lib/auditoria";
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
    if (params.get("semunidade") === "1") {
      setErro("Seu usuário ainda não tem nenhuma unidade vinculada. Fale com o Administrador do sistema.");
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
    const { data: perfil } = await supabase.from("perfis").select("bloqueado, nome").eq("id", user.id).single();
    if (perfil?.bloqueado) {
      await registrarAuditoria({
        tipoEvento: "login",
        entidade: "perfis",
        entidadeId: user.id,
        descricao: `Tentativa de login bloqueada — usuário "${login}" está com acesso bloqueado.`,
        usuarioId: user.id,
        unidadeId: null
      });
      await supabase.auth.signOut();
      setCarregando(false);
      setErro("Seu acesso foi bloqueado. Fale com o Administrador do sistema.");
      return;
    }

    await registrarAuditoria({
      tipoEvento: "login",
      entidade: "perfis",
      entidadeId: user.id,
      descricao: `Login realizado: ${perfil?.nome || login}.`,
      usuarioId: user.id,
      unidadeId: null
    });

    router.push("/inicio");
  }

  return (
    <div className="h-screen overflow-hidden flex bg-canvas">
      <div className="hidden lg:flex flex-1 items-center justify-center bg-surface relative">
        <img src="/logos/samsung-contigo.png" alt="Samsung Contigo — Grupo J.Macedo" className="w-full max-w-2xl h-auto px-16" />
      </div>

      <div className="w-full lg:w-[440px] bg-canvas flex items-center justify-center p-8 relative">
        <BotaoTema className="absolute top-6 right-6" />
        <form onSubmit={entrar} className="w-full max-w-sm">
          <div className="lg:hidden mb-8 flex justify-center">
            <img src="/logos/samsung-contigo.png" alt="Samsung Contigo — Grupo J.Macedo" className="h-20 w-auto" />
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

          <EsqueciSenha loginAtual={login} />
        </form>
      </div>
    </div>
  );
}

function EsqueciSenha({ loginAtual }) {
  const [aberto, setAberto] = useState(false);
  const [login, setLogin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  function abrir(e) {
    e.preventDefault();
    setLogin(loginAtual || "");
    setEnviado(false);
    setAberto(true);
  }

  async function enviar() {
    if (!login.trim()) return;
    setEnviando(true);
    await supabase.from("notificacoes").insert({
      tipo: "esqueci_senha",
      usuario_login: login.trim(),
      mensagem: `${login.trim()} solicitou redefinição de senha na tela de login.`
    });
    setEnviando(false);
    setEnviado(true);
  }

  return (
    <>
      <button type="button" onClick={abrir} className="w-full text-center text-xs text-muted hover:text-ink mt-4">
        Esqueci minha senha
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAberto(false)} />
          <div className="card relative w-full max-w-sm p-6 shadow-2xl">
            {enviado ? (
              <>
                <p className="font-display font-semibold text-[15px] mb-2">Solicitação enviada</p>
                <p className="text-sm text-muted mb-5">
                  Um administrador foi avisado e vai redefinir sua senha em breve. Aguarde o contato.
                </p>
                <button className="btn-primary w-full" onClick={() => setAberto(false)}>Fechar</button>
              </>
            ) : (
              <>
                <p className="font-display font-semibold text-[15px] mb-2">Esqueci minha senha</p>
                <p className="text-sm text-muted mb-4">Digite seu login. Um administrador vai ser avisado para redefinir sua senha.</p>
                <input
                  className="field-input mb-4"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="samara.oliveira"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button className="btn-secondary flex-1" onClick={() => setAberto(false)}>Cancelar</button>
                  <button className="btn-primary flex-1" disabled={!login.trim() || enviando} onClick={enviar}>
                    {enviando ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
