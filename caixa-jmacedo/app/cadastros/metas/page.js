"use client";
import { useEffect, useState } from "react";
import AppShell from "../../../components/AppShell";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS } from "../../../lib/permissions";

function mesAtual() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function ConteudoMetas() {
  const { usuario, unidades } = useSessao();
  const [metas, setMetas] = useState({});
  const [salvo, setSalvo] = useState({});

  useEffect(() => {
    supabase
      .from("metas")
      .select("*")
      .eq("mes_referencia", mesAtual())
      .then(({ data }) => {
        const mapa = {};
        (data || []).forEach((m) => (mapa[m.unidade_id] = m.valor_meta));
        setMetas(mapa);
      });
  }, []);

  async function salvar(unidadeId) {
    await supabase.from("metas").upsert(
      {
        unidade_id: unidadeId,
        mes_referencia: mesAtual(),
        valor_meta: Number(metas[unidadeId] || 0),
        atualizado_por: usuario.id,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "unidade_id,mes_referencia" }
    );
    setSalvo((s) => ({ ...s, [unidadeId]: true }));
    setTimeout(() => setSalvo((s) => ({ ...s, [unidadeId]: false })), 1500);
  }

  // Regra aprovada: só a Gerência edita a meta (Administrador/Diretor também têm acesso total)
  const podeEditar = [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(usuario.cargo);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Cadastros</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Meta mensal por unidade</h1>
        <p className="text-sm text-muted mt-1">Mês de referência: {mesAtual().slice(0, 7)}</p>
      </div>

      <div className="card divide-y divide-line">
        {unidades.map((u) => (
          <div key={u.id} className="p-3 flex items-center justify-between gap-3 text-sm">
            <span>{u.nome}</span>
            <div className="flex items-center gap-2">
              <input
                className="field-input font-mono-num w-36"
                type="number"
                value={metas[u.id] ?? ""}
                disabled={!podeEditar}
                onChange={(e) => setMetas({ ...metas, [u.id]: e.target.value })}
              />
              {podeEditar && (
                <button className="btn" onClick={() => salvar(u.id)}>
                  {salvo[u.id] ? "Salvo ✓" : "Salvar"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!podeEditar && (
        <p className="text-sm text-muted mt-3">Somente a Gerência edita a meta da própria unidade.</p>
      )}
    </div>
  );
}

export default function CadastroMetas() {
  return (
    <AppShell>
      <ConteudoMetas />
    </AppShell>
  );
}
