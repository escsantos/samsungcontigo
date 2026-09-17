"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, ShieldAlert } from "lucide-react";
import { getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell, { GRUPOS_MENU } from "../../../components/AppShell";

export default function MenuGrupoPage() {
  const { grupo: grupoId } = useParams();
  const router = useRouter();
  const [perfil, setPerfil] = useState(undefined);

  useEffect(() => {
    getPerfilAtual().then(setPerfil);
  }, []);

  const grupo = GRUPOS_MENU.find((g) => g.id === grupoId);

  if (perfil === undefined) {
    return <AppShell titulo="Menu"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (!grupo) {
    return <AppShell titulo="Menu"><p className="text-sm text-muted">Grupo não encontrado.</p></AppShell>;
  }

  const opcoes = grupo.itens.filter((item) => item.cargos.includes(perfil?.cargo));

  return (
    <AppShell titulo={grupo.label}>
      {opcoes.length === 0 ? (
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Você não tem acesso a nenhuma opção de {grupo.label}.</p>
        </div>
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
                  style={{ background: `${item.cor}22`, color: item.cor }}
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
