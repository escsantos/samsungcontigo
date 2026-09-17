"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, Check, RefreshCw } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import { sugerirLoginCliente } from "../../../lib/usuarios";
import { getUnidadeAtiva } from "../../../lib/unidade";
import { registrarAuditoria } from "../../../lib/auditoria";
import AppShell from "../../../components/AppShell";
import ClienteForm from "../../../components/ClienteForm";
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

export default function NovoClientePage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [vendedores, setVendedores] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [chaveForm, setChaveForm] = useState(0);

  const [dadosAtuais, setDadosAtuais] = useState(null);
  const [criarAcesso, setCriarAcesso] = useState(true);
  const [loginEditado, setLoginEditado] = useState("");
  const [loginTocado, setLoginTocado] = useState(false);
  const [checandoLogin, setChecandoLogin] = useState(false);
  const [loginDisponivel, setLoginDisponivel] = useState(null);
  const [credenciais, setCredenciais] = useState(null);

  const podeGerenciarUsuarios = ["Administrador", "Diretor", "Gerente", "Supervisor"].includes(perfil?.cargo);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase.from("perfis").select("id, nome").eq("cargo", "Vendedor").order("nome");
      setVendedores(data || []);
    })();
  }, []);

  // sugere o login automaticamente enquanto a pessoa não mexeu nele manualmente
  useEffect(() => {
    if (!dadosAtuais || loginTocado) return;
    const sugestao = sugerirLoginCliente(dadosAtuais);
    setLoginEditado(sugestao);
  }, [dadosAtuais, loginTocado]);

  // checa disponibilidade do login (com um pequeno atraso pra não bater no banco a cada letra)
  useEffect(() => {
    if (!criarAcesso || !loginEditado) {
      setLoginDisponivel(null);
      return;
    }
    setChecandoLogin(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.from("perfis").select("id").eq("login", loginEditado).maybeSingle();
      setLoginDisponivel(!data);
      setChecandoLogin(false);
    }, 400);
    return () => clearTimeout(t);
  }, [loginEditado, criarAcesso]);

  async function salvar(dados) {
    setErro("");
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...dados, criado_por: user.id };
    if (!payload.vendedor_id) payload.vendedor_id = null;
    if (!payload.data_nascimento) payload.data_nascimento = null;

    const { data: novoCliente, error } = await supabase.from("clientes").insert(payload).select().single();
    if (error) {
      setSalvando(false);
      if (error.message.includes("idx_clientes_cpf")) setErro("Já existe um cliente cadastrado com esse CPF.");
      else if (error.message.includes("idx_clientes_cnpj")) setErro("Já existe um cliente cadastrado com esse CNPJ.");
      else setErro("Não consegui salvar: " + error.message);
      return;
    }

    await registrarAuditoria({
      tipoEvento: "criacao",
      entidade: "clientes",
      entidadeId: novoCliente.id,
      descricao: `Cliente criado: ${novoCliente.nome}.`
    });

    // cria o acesso ao sistema, se marcado
    if (criarAcesso && podeGerenciarUsuarios && loginEditado) {
      const partes = loginEditado.split(".");
      const unidadeAtiva = getUnidadeAtiva();
      try {
        const res = await chamarApi("/api/usuarios", {
          method: "POST",
          body: JSON.stringify({
            nome: partes[0] || loginEditado,
            sobrenome: partes[1] || partes[0] || loginEditado,
            cargo: "Cliente",
            clienteId: novoCliente.id,
            nomeCompleto: dados.nome,
            unidadeIds: unidadeAtiva ? [unidadeAtiva.id] : []
          })
        });
        setSalvando(false);
        setCredenciais(res);
        return; // o sucesso final aparece depois de fechar o pop-up de credenciais
      } catch (e) {
        setSalvando(false);
        setErro("Cliente cadastrado, mas não consegui criar o acesso: " + e.message);
        return;
      }
    }

    setSalvando(false);
    setSucesso(true);
  }

  function novoCadastro() {
    setSucesso(false);
    setChaveForm((k) => k + 1);
    setLoginTocado(false);
    setLoginEditado("");
    setDadosAtuais(null);
  }

  function fecharCredenciais() {
    setCredenciais(null);
    setSucesso(true);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Novo Cliente"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Supervisor", "Vendedor"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Novo Cliente">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Você não tem permissão para cadastrar clientes.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Novo Cliente">
      <button onClick={() => router.push("/clientes")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink mb-4">
        <ArrowLeft size={15} />
        Voltar para Clientes
      </button>
      <div className="max-w-3xl space-y-4">
        <ClienteForm key={chaveForm} vendedores={vendedores} onSalvar={salvar} salvando={salvando} onErro={setErro} onChange={setDadosAtuais} />

        {podeGerenciarUsuarios && (
          <div className="card p-6">
            <label className="flex items-center gap-2.5 mb-1">
              <input type="checkbox" checked={criarAcesso} onChange={(e) => setCriarAcesso(e.target.checked)} />
              <span className="font-display font-semibold text-[15px]">Criar acesso ao sistema para este cliente</span>
            </label>
            <p className="text-xs text-muted mb-4 ml-6">
              O cliente poderá fazer login para montar orçamentos. Senha inicial: <span className="font-mono">samsungcontigo001</span>
            </p>

            {criarAcesso && (
              <div className="ml-6">
                <label className="field-label">Login</label>
                <div className="relative max-w-xs">
                  <input
                    className="field-input pr-9"
                    value={loginEditado}
                    onChange={(e) => { setLoginEditado(e.target.value.toLowerCase()); setLoginTocado(true); }}
                    placeholder="nome.sobrenome"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2">
                    {checandoLogin ? (
                      <RefreshCw size={14} className="animate-spin text-muted" />
                    ) : loginDisponivel === true ? (
                      <Check size={14} style={{ color: "#2C7C6E" }} />
                    ) : loginDisponivel === false ? (
                      <span className="text-danger text-xs font-bold">!</span>
                    ) : null}
                  </span>
                </div>
                {loginDisponivel === false && !checandoLogin && (
                  <p className="text-xs text-danger mt-1.5">
                    Esse login já existe. Sugestão: <button type="button" className="underline" onClick={() => setLoginEditado(loginEditado + "2")}>{loginEditado}2</button>
                  </p>
                )}
                {loginDisponivel === true && !checandoLogin && (
                  <p className="text-xs mt-1.5" style={{ color: "#2C7C6E" }}>Login disponível.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        open={!!erro}
        onClose={() => setErro("")}
        title="Não foi possível salvar"
        footer={<button className="btn-primary" onClick={() => setErro("")}>Entendi</button>}
      >
        <p className="text-sm text-muted">{erro}</p>
      </Modal>

      <CredenciaisModal dados={credenciais} onClose={fecharCredenciais} />

      <Modal
        open={sucesso}
        onClose={novoCadastro}
        title="Cliente cadastrado!"
        footer={
          <>
            <button className="btn-secondary" onClick={() => router.push("/clientes")}>Ver lista de clientes</button>
            <button className="btn-primary" onClick={novoCadastro}>Cadastrar outro cliente</button>
          </>
        }
      >
        <p className="text-sm text-muted">O cadastro foi salvo com sucesso.</p>
      </Modal>
    </AppShell>
  );
}
