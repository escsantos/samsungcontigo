"use client";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import AppShell from "../../../components/AppShell";
import CurrencyInput from "../../../components/CurrencyInput";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS } from "../../../lib/permissions";

function proximosMeses(qtd) {
  const hoje = new Date();
  const meses = [];
  for (let i = 0; i < qtd; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    meses.push(d.toISOString().slice(0, 10));
  }
  return meses;
}

function rotuloMes(iso) {
  const abrev = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const d = new Date(iso + "T00:00:00");
  return `${abrev[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
}

function Conteudo() {
  const { usuario, unidades } = useSessao();
  const meses = proximosMeses(3); // mês atual + 2 seguintes, sempre rolando
  const [metas, setMetas] = useState({}); // { unidadeId: { mesIso: { linha: valor } } }
  const [salvo, setSalvo] = useState({});

  // uma linha da tabela por (unidade, linha) — unidade que atende as duas
  // linhas (CI e IH) aparece 2x, cada uma com meta própria
  const linhasTabela = unidades.flatMap((u) => {
    const linhasDaUnidade = u.atende_ih ? ["ci", "ih"] : ["ci"];
    return linhasDaUnidade.map((linha) => ({ unidade: u, linha }));
  });

  useEffect(() => {
    supabase
      .from("metas")
      .select("*")
      .gte("mes_referencia", meses[0])
      .lte("mes_referencia", meses[meses.length - 1])
      .then(({ data }) => {
        const mapa = {};
        (data || []).forEach((m) => {
          mapa[m.unidade_id] = mapa[m.unidade_id] || {};
          mapa[m.unidade_id][m.mes_referencia] = mapa[m.unidade_id][m.mes_referencia] || {};
          mapa[m.unidade_id][m.mes_referencia][m.linha] = m.valor_meta;
        });
        setMetas(mapa);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function setValor(unidadeId, mesIso, linha, valor) {
    setMetas((atual) => ({
      ...atual,
      [unidadeId]: {
        ...(atual[unidadeId] || {}),
        [mesIso]: { ...(atual[unidadeId]?.[mesIso] || {}), [linha]: valor },
      },
    }));
    const chave = `${unidadeId}-${mesIso}-${linha}`;
    setSalvo((s) => ({ ...s, [chave]: false }));
  }

  async function salvar(unidadeId, mesIso, linha) {
    const valor = Number(metas[unidadeId]?.[mesIso]?.[linha] || 0);
    await supabase.from("metas").upsert(
      {
        unidade_id: unidadeId,
        mes_referencia: mesIso,
        linha,
        valor_meta: valor,
        atualizado_por: usuario.id,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "unidade_id,mes_referencia,linha" }
    );
    const chave = `${unidadeId}-${mesIso}-${linha}`;
    setSalvo((s) => ({ ...s, [chave]: true }));
  }

  const podeEditar = [CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(usuario.cargo);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Metas mensais por unidade</h1>
        <p className="text-sm text-muted mt-1">
          O mês vazio precisa ser definido pela Gerência — assim que um mês passa, ele some da lista e o próximo entra.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted border-b border-line">
              <td className="p-3">Unidade</td>
              {meses.map((m) => (
                <td key={m} className="p-3 text-center">{rotuloMes(m)}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasTabela.map(({ unidade: u, linha }) => (
              <tr key={`${u.id}-${linha}`} className="border-t border-line">
                <td className="p-3">
                  {u.nome}{" "}
                  {u.atende_ih && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${linha === "ih" ? "bg-teal-soft text-teal" : "bg-canvas text-muted"}`}>
                      {linha === "ih" ? "IH" : "CI"}
                    </span>
                  )}
                </td>
                {meses.map((m) => {
                  const chave = `${u.id}-${m}-${linha}`;
                  return (
                    <td key={m} className="p-3">
                      <div className="flex items-center gap-1.5">
                        <CurrencyInput
                          valor={metas[u.id]?.[m]?.[linha] ?? ""}
                          onChange={(v) => setValor(u.id, m, linha, v)}
                          disabled={!podeEditar}
                          className="w-44"
                        />
                        {podeEditar && (
                          <button
                            className={`p-1.5 rounded-md transition ${
                              salvo[chave] ? "text-white bg-teal" : "text-muted hover:text-ink hover:bg-canvas"
                            }`}
                            title={salvo[chave] ? "Salvo" : "Salvar"}
                            onClick={() => salvar(u.id, m, linha)}
                          >
                            <Save size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
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
      <Conteudo />
    </AppShell>
  );
}
