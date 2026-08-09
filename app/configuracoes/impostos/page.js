"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, ShieldAlert, Percent } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";

export default function ImpostosPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState({});
  const [modalNovo, setModalNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [percentualNovo, setPercentualNovo] = useState("");
  const [confirmarExcluir, setConfirmarExcluir] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      await recarregar();
    })();
  }, []);

  async function recarregar() {
    setCarregando(true);
    const { data } = await supabase.from("impostos").select("*").order("criado_em");
    setLista(data || []);
    setCarregando(false);
  }

  function iniciarEdicao(imposto) {
    setEditando((e) => ({ ...e, [imposto.id]: { nome: imposto.nome, percentual: String(imposto.percentual) } }));
  }

  async function salvarEdicao(id) {
    const dados = editando[id];
    if (!dados) return;
    const percentual = parseFloat(dados.percentual);
    if (!dados.nome.trim() || isNaN(percentual) || percentual < 0 || percentual > 100) {
      setErro("Preencha um nome e um percentual válido (0 a 100).");
      return;
    }
    setErro("");
    await supabase.from("impostos").update({ nome: dados.nome.trim(), percentual }).eq("id", id);
    setEditando((e) => {
      const novo = { ...e };
      delete novo[id];
      return novo;
    });
    await recarregar();
  }

  async function alternarAtivo(imposto) {
    await supabase.from("impostos").update({ ativo: !imposto.ativo }).eq("id", imposto.id);
    await recarregar();
  }

  async function excluir() {
    if (!confirmarExcluir) return;
    await supabase.from("impostos").delete().eq("id", confirmarExcluir.id);
    setConfirmarExcluir(null);
    await recarregar();
  }

  async function criar() {
    const percentual = parseFloat(percentualNovo);
    if (!nomeNovo.trim() || isNaN(percentual) || percentual < 0 || percentual > 100) {
      setErro("Preencha um nome e um percentual válido (0 a 100).");
      return;
    }
    setErro("");
    await supabase.from("impostos").insert({ nome: nomeNovo.trim(), percentual, ativo: true });
    setModalNovo(false);
    setNomeNovo("");
    setPercentualNovo("");
    await recarregar();
  }

  if (perfil === undefined) {
    return <AppShell titulo="Impostos"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && perfil.cargo !== "Administrador") {
    return (
      <AppShell titulo="Impostos">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Administrador pode gerenciar impostos.</p>
        </div>
      </AppShell>
    );
  }

  const totalAtivo = lista.filter((i) => i.ativo).reduce((s, i) => s + Number(i.percentual), 0);

  return (
    <AppShell titulo="Impostos">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Percent size={15} style={{ color: "var(--accent)" }} />
          Total ativo aplicado no cálculo de venda: <span className="font-mono font-semibold text-ink">{totalAtivo.toFixed(2)}%</span>
        </div>
        <button className="btn-primary" onClick={() => setModalNovo(true)}>
          <Plus size={16} />
          Novo imposto
        </button>
      </div>

      {erro && <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum imposto cadastrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Nome</th>
                <th className="text-left px-4 py-2.5">Percentual</th>
                <th className="text-left px-4 py-2.5">Ativo</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const emEdicao = editando[i.id];
                return (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5">
                      {emEdicao ? (
                        <input
                          className="field-input py-1.5 text-sm w-40"
                          value={emEdicao.nome}
                          onChange={(e) => setEditando((ed) => ({ ...ed, [i.id]: { ...ed[i.id], nome: e.target.value } }))}
                        />
                      ) : (
                        <span className={i.ativo ? "" : "text-muted"}>{i.nome}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono">
                      {emEdicao ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="0.01"
                            className="field-input py-1.5 text-sm w-24"
                            value={emEdicao.percentual}
                            onChange={(e) => setEditando((ed) => ({ ...ed, [i.id]: { ...ed[i.id], percentual: e.target.value } }))}
                          />
                          <span className="text-muted">%</span>
                        </div>
                      ) : (
                        <span className={i.ativo ? "" : "text-muted"}>{Number(i.percentual).toFixed(2)}%</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => alternarAtivo(i)}
                        className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded"
                        style={{
                          background: i.ativo ? "rgba(63,167,150,0.14)" : "var(--canvas)",
                          color: i.ativo ? "#2C7C6E" : "var(--muted)"
                        }}
                      >
                        {i.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        {emEdicao ? (
                          <button
                            title="Salvar"
                            onClick={() => salvarEdicao(i.id)}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas"
                          >
                            <Save size={15} />
                          </button>
                        ) : (
                          <button
                            title="Editar"
                            onClick={() => iniciarEdicao(i)}
                            className="text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-canvas"
                            style={{ color: "var(--accent)" }}
                          >
                            Editar
                          </button>
                        )}
                        <button
                          title="Excluir"
                          onClick={() => setConfirmarExcluir(i)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-danger hover:bg-danger-soft"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        title="Novo imposto"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalNovo(false)}>Cancelar</button>
            <button className="btn-primary" onClick={criar}>Salvar</button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="field-label">Nome</label>
            <input className="field-input" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="ICMS Peças" />
          </div>
          <div>
            <label className="field-label">Percentual (%)</label>
            <input type="number" step="0.01" className="field-input" value={percentualNovo} onChange={(e) => setPercentualNovo(e.target.value)} placeholder="8.45" />
          </div>
        </div>
      </Modal>

      <Modal
        open={!!confirmarExcluir}
        onClose={() => setConfirmarExcluir(null)}
        title="Excluir imposto?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarExcluir(null)}>Cancelar</button>
            <button className="btn-primary" onClick={excluir}>Excluir</button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Isso vai remover "<b>{confirmarExcluir?.nome}</b>" ({confirmarExcluir ? Number(confirmarExcluir.percentual).toFixed(2) : ""}%) permanentemente.
        </p>
      </Modal>
    </AppShell>
  );
}
