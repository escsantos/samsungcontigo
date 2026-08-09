"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getPerfilAtual } from "../../lib/supabaseClient";
import AppShell, { ITENS_CONFIGURACOES } from "../../components/AppShell";

export default function ConfiguracoesPage() {
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  if (perfil === undefined) {
    return <AppShell titulo="Configurações"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  const opcoes = ITENS_CONFIGURACOES.filter((item) => item.cargos.includes(perfil?.cargo));

  return (
    <AppShell titulo="Configurações">
      {opcoes.length === 0 ? (
        <p className="text-sm text-muted">Você não tem acesso a nenhuma opção de configuração.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {opcoes.map((item) => {
            const Icone = item.icone;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="card p-5 text-left hover:-translate-y-0.5 transition group"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <Icone size={20} />
                </div>
                <div className="flex items-center gap-1.5">
                  <p className="font-display font-semibold text-[15px]">{item.label}</p>
                  <ChevronRight size={15} className="text-muted group-hover:translate-x-0.5 transition" />
                </div>
                <p className="text-xs text-muted mt-1.5 leading-relaxed">{item.descricao}</p>
              </button>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
