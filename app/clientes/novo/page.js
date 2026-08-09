"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import ClienteForm from "../../../components/ClienteForm";

export default function NovoClientePage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [vendedores, setVendedores] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase.from("perfis").select("id, nome").order("nome");
      setVendedores(data || []);
    })();
  }, []);

  async function salvar(dados) {
    setErro("");
    setSalvando(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload = { ...dados, criado_por: user.id };
    if (!payload.vendedor_id) payload.vendedor_id = null;
    if (!payload.data_nascimento) payload.data_nascimento = null;

    const { data, error } = await supabase.from("clientes").insert(payload).select().single();
    setSalvando(false);
    if (error) {
      if (error.message.includes("idx_clientes_cpf")) setErro("Já existe um cliente cadastrado com esse CPF.");
      else if (error.message.includes("idx_clientes_cnpj")) setErro("Já existe um cliente cadastrado com esse CNPJ.");
      else setErro("Não consegui salvar: " + error.message);
      return;
    }
    router.push(`/clientes/${data.id}`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Novo Cliente"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Vendedor"].includes(perfil.cargo)) {
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
      <div className="max-w-3xl">
        <ClienteForm vendedores={vendedores} onSalvar={salvar} salvando={salvando} erro={erro} />
      </div>
    </AppShell>
  );
}
