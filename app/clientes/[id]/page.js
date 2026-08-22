"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ShieldAlert, Trash2 } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import ClienteForm from "../../../components/ClienteForm";
import Modal from "../../../components/Modal";
import { registrarAuditoria } from "../../../lib/auditoria";

export default function EditarClientePage() {
  const { id } = useParams();
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [cliente, setCliente] = useState(undefined);
  const [vendedores, setVendedores] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data } = await supabase.from("clientes").select("*").eq("id", id).single();
      setCliente(data);
      const { data: vend } = await supabase.from("perfis").select("id, nome").eq("cargo", "Vendedor").order("nome");
      setVendedores(vend || []);
    })();
  }, [id]);

  async function salvar(dados) {
    setErro("");
    setSalvando(true);
    const payload = { ...dados };
    delete payload.id;
    delete payload.criado_em;
    delete payload.criado_por;
    if (!payload.vendedor_id) payload.vendedor_id = null;
    if (!payload.data_nascimento) payload.data_nascimento = null;

    const { error } = await supabase.from("clientes").update(payload).eq("id", id);
    setSalvando(false);
    if (error) {
      if (error.message.includes("idx_clientes_cpf")) setErro("Já existe um cliente cadastrado com esse CPF.");
      else if (error.message.includes("idx_clientes_cnpj")) setErro("Já existe um cliente cadastrado com esse CNPJ.");
      else setErro("Não consegui salvar: " + error.message);
      return;
    }
    await registrarAuditoria({
      tipoEvento: "edicao",
      entidade: "clientes",
      entidadeId: id,
      descricao: `Cliente editado: ${dados.nome}.`
    });
    setSucesso(true);
  }

  async function excluir() {
    await registrarAuditoria({
      tipoEvento: "exclusao",
      entidade: "clientes",
      entidadeId: id,
      descricao: `Cliente excluído: ${cliente?.nome || ""}.`
    });
    await supabase.from("clientes").delete().eq("id", id);
    router.push("/clientes");
  }

  if (perfil === undefined || cliente === undefined) {
    return <AppShell titulo="Cliente"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Vendedor"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Cliente">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Você não tem permissão para ver esta página.</p>
        </div>
      </AppShell>
    );
  }

  if (!cliente) {
    return (
      <AppShell titulo="Cliente">
        <p className="text-sm text-muted">Cliente não encontrado.</p>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Editar Cliente">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => router.push("/clientes")} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft size={15} />
          Voltar para Clientes
        </button>
        <button onClick={() => setConfirmarExcluir(true)} className="flex items-center gap-1.5 text-sm text-danger hover:opacity-80">
          <Trash2 size={15} />
          Excluir cliente
        </button>
      </div>
      <div className="max-w-3xl">
        <ClienteForm inicial={cliente} vendedores={vendedores} onSalvar={salvar} salvando={salvando} onErro={setErro} />
      </div>

      <Modal
        open={!!erro}
        onClose={() => setErro("")}
        title="Não foi possível salvar"
        footer={<button className="btn-primary" onClick={() => setErro("")}>Entendi</button>}
      >
        <p className="text-sm text-muted">{erro}</p>
      </Modal>

      <Modal
        open={sucesso}
        onClose={() => router.push("/clientes")}
        title="Alterações salvas!"
        footer={<button className="btn-primary" onClick={() => router.push("/clientes")}>Voltar para Clientes</button>}
      >
        <p className="text-sm text-muted">Os dados de {cliente.nome} foram atualizados.</p>
      </Modal>

      <Modal
        open={confirmarExcluir}
        onClose={() => setConfirmarExcluir(false)}
        title="Excluir cliente?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarExcluir(false)}>Cancelar</button>
            <button className="btn-primary" onClick={excluir}>Excluir</button>
          </>
        }
      >
        <p className="text-sm text-muted">Isso vai excluir permanentemente <b>{cliente.nome}</b>. Essa ação não pode ser desfeita.</p>
      </Modal>
    </AppShell>
  );
}
