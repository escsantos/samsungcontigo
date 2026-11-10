"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, LogOut, MapPin } from "lucide-react";
import { supabase, getPerfilAtual } from "../../lib/supabaseClient";
import { setUnidadeAtiva, buscarUnidadesDoUsuario, limparUnidadeAtiva } from "../../lib/unidade";
import BotaoTema from "../../components/BotaoTema";
import { visualUnidade, tipoDaUnidade } from "../../lib/visualUnidade";

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

  // Cards no mesmo estilo do Sistema de Inventário (10/11/2026): cor e ícone
  // animado lembrando a cidade/região, tipo (CSP/ESC/MSC), cidade e ASC.
  const n = unidades.length;
  const colunas = n > 9 ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : n > 4 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex items-center justify-center bg-canvas px-4 py-14 sm:px-6 lg:py-4 relative">
      <BotaoTema className="absolute top-4 right-4 sm:top-6 sm:right-6" />
      <button onClick={sair} className="absolute top-4 left-4 sm:top-6 sm:left-6 flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <LogOut size={15} />
        Sair
      </button>

      <div className={`w-full ${n > 9 ? "max-w-[1560px]" : "max-w-[1120px]"}`}>
        <div className="text-center mb-5">
          <div className="inline-flex items-center gap-3 bg-white rounded-2xl px-3.5 py-1.5 border border-line mb-3">
            <img src="/logos/grupo-jmacedo.png" alt="Grupo J.Macedo" className="h-8 w-auto" />
            <span className="w-px h-7 bg-line" />
            <img src="/logos/samsung-contigo.png" alt="Samsung Contigo" className="h-8 w-auto" />
          </div>
          <h1 className="font-display text-xl font-semibold text-ink leading-tight">
            {trocando ? "Trocar de unidade" : "Selecione a unidade"}
          </h1>
          <p className="text-sm text-muted">Olá, {perfil.nome.split(" ")[0]}. Qual unidade você quer acessar?</p>
        </div>

        <div className={`grid gap-2.5 ${colunas}`}>
          {unidades.map((u, i) => {
            const v = visualUnidade(u);
            const tipo = tipoDaUnidade(u);
            const Icone = v.icone;
            const [c1, c2] = v.cores;
            return (
              <button
                key={u.id}
                onClick={() => escolher(u)}
                title={`${u.nome}${v.regiao ? ` · ${v.regiao}` : ""}`}
                className="group card relative overflow-hidden text-left px-3.5 py-3 pt-4 hover:-translate-y-1 hover:shadow-xl transition inv-surge min-w-0"
                style={{ animationDelay: `${i * 45}ms`, borderColor: `${c1}33` }}
              >
                <div className="absolute inset-x-0 top-0 h-[4px]" style={{ background: `linear-gradient(90deg, ${c1}, ${c2})` }} />
                {/* fundo: ícone grande da região + brilho passando */}
                <div className="absolute -right-4 -bottom-5 opacity-[0.09] pointer-events-none" style={{ color: c1 }}><Icone size={88} strokeWidth={1.4} /></div>
                <div className="absolute inset-y-0 w-1/3 pointer-events-none inv-onda-card opacity-0 group-hover:opacity-100" style={{ background: `linear-gradient(90deg, transparent, ${c2}33, transparent)` }} />

                <div className="flex items-center gap-3 relative">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-md" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})`, color: "#fff" }}>
                    <span className={`inline-flex ${v.anim}`}><Icone size={21} /></span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {tipo && <span className="text-[9.5px] font-extrabold px-1.5 py-0.5 rounded-md tracking-wide shrink-0" style={{ background: `${c1}18`, color: c1 }}>{tipo}</span>}
                      <span className="text-[10.5px] font-semibold truncate" style={{ color: c1 }}>{v.regiao}</span>
                    </div>
                    <p className="font-display font-bold text-[14.5px] leading-tight mt-0.5 truncate">{u.nome}</p>
                    <p className="text-[11px] text-muted flex items-center gap-1 mt-0.5 whitespace-nowrap overflow-hidden">
                      {u.cidade && <><MapPin size={11} className="shrink-0" /> <span className="truncate">{u.cidade}</span></>}
                      {u.asc_cod && <span className="font-mono ml-1 shrink-0">· ASC {u.asc_cod}</span>}
                    </p>
                  </div>
                  <span className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition group-hover:translate-x-0.5" style={{ background: `${c1}14`, color: c1 }}>
                    <ChevronRight size={15} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
