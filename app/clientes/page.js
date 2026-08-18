"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Search, ShieldAlert, Building2, User } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import AppShell from "../../components/AppShell";
import { getUnidadeAtiva } from "../../lib/unidade";

function normKey(s) {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

export default function ClientesPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [termo, setTermo] = useState("");

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const unidadeAtiva = getUnidadeAtiva();
      let query = supabase
        .from("clientes")
        .select("*, perfis!clientes_vendedor_id_fkey(nome)")
        .order("nome");
      if (unidadeAtiva) {
        const { data: vinculos } = await supabase.from("perfis_unidades").select("perfil_id").eq("unidade_id", unidadeAtiva.id);
        const idsDaUnidade = (vinculos || []).map((v) => v.perfil_id);
        if (idsDaUnidade.length > 0) {
          query = query.or(`vendedor_id.is.null,vendedor_id.in.(${idsDaUnidade.join(",")})`);
        } else {
          query = query.is("vendedor_id", null);
        }
      }
      const { data } = await query;
      setLista(data || []);
      setCarregando(false);
    })();
  }, []);

  if (perfil === undefined) {
    return <AppShell titulo="Clientes"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente", "Vendedor"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Clientes">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Você não tem permissão para ver esta página.</p>
        </div>
      </AppShell>
    );
  }

  const filtrados = lista.filter((c) => {
    const t = normKey(termo);
    if (!t) return true;
    return (
      normKey(c.nome).includes(t) ||
      normKey(c.nome_fantasia).includes(t) ||
      normKey(c.cpf).includes(t) ||
      normKey(c.cnpj).includes(t) ||
      normKey(c.celular).includes(t) ||
      normKey(c.perfis?.nome).includes(t)
    );
  });

  return (
    <AppShell titulo="Clientes">
      <div className="flex justify-between items-center mb-4 gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px] relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            className="field-input pl-10"
            placeholder="Buscar por nome, CPF, CNPJ, celular ou vendedor..."
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={() => router.push("/clientes/novo")}>
          <UserPlus size={16} />
          Novo cliente
        </button>
      </div>

      <p className="text-sm text-muted mb-3">{filtrados.length} cliente(s)</p>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum cliente encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Nome</th>
                <th className="text-left px-4 py-2.5">Documento</th>
                <th className="text-left px-4 py-2.5">Contato</th>
                <th className="text-left px-4 py-2.5">Vendedor</th>
                <th className="text-left px-4 py-2.5">Categoria</th>
                <th className="text-left px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-line last:border-0 hover:bg-canvas cursor-pointer"
                  onClick={() => router.push(`/clientes/${c.id}`)}
                >
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2">
                      {c.tipo_pessoa === "juridica" ? <Building2 size={14} className="text-muted" /> : <User size={14} className="text-muted" />}
                      {c.nome}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted">{c.tipo_pessoa === "juridica" ? c.cnpj : c.cpf}</td>
                  <td className="px-4 py-2.5 text-muted">{c.celular || c.email || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{c.perfis?.nome || "—"}</td>
                  <td className="px-4 py-2.5">{c.categoria || "—"}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded"
                      style={{
                        background: c.status === "Ativo" ? "rgba(63,167,150,0.14)" : c.status === "Bloqueado" ? "var(--danger-soft)" : "var(--canvas)",
                        color: c.status === "Ativo" ? "#2C7C6E" : c.status === "Bloqueado" ? "var(--danger)" : "var(--muted)"
                      }}
                    >
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
