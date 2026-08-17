"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronRight, LogOut } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import { setUnidadeAtiva, buscarUnidadesDoUsuario, limparUnidadeAtiva } from "../../lib/unidade";
import BotaoTema from "../../components/BotaoTema";

export default function SelecionarUnidadePage() {
  return (
    <Suspense fallback={null}>
      <SelecionarUnidadeConteudo />
    </Suspense>
  );
}

function SelecionarUnidadeConteudo() {
  const router = useRouter();
  const params = useSearchParams();
  const [perfil, setPerfil] = useState(undefined);
  const [unidades, setUnidades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const trocando = params.get("trocar") === "1";

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      const p = await getPerfilAtual();
      if (!p) {
        router.replace("/login");
        return;
      }
      setPerfil(p);
      const lista = await buscarUnidadesDoUsuario(supabase, p.id);
      if (lista.length === 0) {
        await supabase.auth.signOut();
        limparUnidadeAtiva();
        router.replace("/login?semunidade=1");
        return;
      }
      if (lista.length === 1 && !trocando) {
        setUnidadeAtiva(lista[0]);
        router.replace("/inicio");
        return;
      }
      setUnidades(lista);
      setCarregando(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function escolher(unidade) {
    setUnidadeAtiva(unidade);
    router.push("/inicio");
  }

  async function sair() {
    await supabase.auth.signOut();
    limparUnidadeAtiva();
    router.replace("/login");
  }

  if (carregando || perfil === undefined) {
    return <div className="h-screen flex items-center justify-center bg-canvas"><p className="text-sm text-muted">Carregando...</p></div>;
  }

  return (
    <div className="h-screen flex items-center justify-center bg-canvas p-6 relative">
      <BotaoTema className="absolute top-6 right-6" />
      <button onClick={sair} className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <LogOut size={15} />
        Sair
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logos/samsung-contigo.png" alt="Samsung Contigo" className="h-14 w-auto mx-auto mb-6" />
          <h1 className="font-display text-xl font-semibold text-ink mb-1">
            {trocando ? "Trocar de unidade" : "Selecione a unidade"}
          </h1>
          <p className="text-sm text-muted">Olá, {perfil.nome.split(" ")[0]}. Qual unidade você quer acessar?</p>
        </div>

        <div className="space-y-2.5">
          {unidades.map((u) => (
            <button
              key={u.id}
              onClick={() => escolher(u)}
              className="w-full card p-4 flex items-center justify-between text-left hover:-translate-y-0.5 transition"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <Building2 size={18} />
                </div>
                <div>
                  <p className="font-display font-semibold text-sm">{u.nome}</p>
                  <p className="text-xs text-muted font-mono">ASC COD. {u.asc_cod}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
