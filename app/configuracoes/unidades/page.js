"use client";
import { useEffect, useState } from "react";
import { Building2, Plus, Pencil, Trash2, ShieldAlert, Check, FileCheck2 } from "lucide-react";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";

export default function UnidadesPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState(null); // null = criando novo
  const [nome, setNome] = useState("");
  const [ascCod, setAscCod] = useState("");
  const [obrigaNotaFiscal, setObrigaNotaFiscal] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [confirmarExclusao, setConfirmarExclusao] = useState(null);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      await recarregar();
    })();
  }, []);

  async function recarregar() {
    setCarregando(true);
    const { data } = await supabase.from("unidades").select("*").order("nome");
    setLista(data || []);
    setCarregando(false);
  }

  function abrirNovo() {
    setEditando(null);
    setNome("");
    setAscCod("");
    setObrigaNotaFiscal(true);
    setErro("");
    setModalAberto(true);
  }

  function abrirEdicao(u) {
    setEditando(u);
    setNome(u.nome);
    setAscCod(u.asc_cod);
    setObrigaNotaFiscal(u.obriga_nota_fiscal !== false);
    setErro("");
    setModalAberto(true);
  }

  async function salvar() {
    const codLimpo = ascCod.trim();
    if (!nome.trim()) {
      setErro("Informe o nome da unidade.");
      return;
    }
    if (!/^[0-9]{7}$/.test(codLimpo)) {
      setErro("O ASC COD. precisa ter exatamente 7 números.");
      return;
    }
    setErro("");
    setSalvando(true);

    if (editando) {
      const { error } = await supabase.from("unidades").update({ nome: nome.trim(), asc_cod: codLimpo, obriga_nota_fiscal: obrigaNotaFiscal }).eq("id", editando.id);
      setSalvando(false);
      if (error) { setErro("Falha ao salvar: " + (error.code === "23505" ? "já existe uma unidade com esse ASC COD." : error.message)); return; }
    } else {
      const { error } = await supabase.from("unidades").insert({ nome: nome.trim(), asc_cod: codLimpo, obriga_nota_fiscal: obrigaNotaFiscal });
      setSalvando(false);
      if (error) { setErro("Falha ao criar: " + (error.code === "23505" ? "já existe uma unidade com esse ASC COD." : error.message)); return; }
    }
    setModalAberto(false);
    recarregar();
  }

  async function alternarAtivo(u) {
    await supabase.from("unidades").update({ ativo: !u.ativo }).eq("id", u.id);
    recarregar();
  }

  async function alternarObrigaNotaFiscal(u) {
    await supabase.from("unidades").update({ obriga_nota_fiscal: !u.obriga_nota_fiscal }).eq("id", u.id);
    recarregar();
  }

  async function excluir() {
    if (!confirmarExclusao) return;
    setSalvando(true);
    const { error } = await supabase.from("unidades").delete().eq("id", confirmarExclusao.id);
    setSalvando(false);
    setConfirmarExclusao(null);
    if (error) {
      setErro("Não consegui excluir — provavelmente já existem dados vinculados a essa unidade. Considere desativar em vez de excluir.");
      return;
    }
    recarregar();
  }

  if (perfil === undefined) {
    return <AppShell titulo="Unidades"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && perfil.cargo !== "Administrador") {
    return (
      <AppShell titulo="Unidades">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só o Administrador pode gerenciar unidades.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Unidades">
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted">{lista.length} unidade(s) cadastrada(s)</p>
        <button className="btn-primary" onClick={abrirNovo}>
          <Plus size={16} />
          Nova unidade
        </button>
      </div>

      {erro && !modalAberto && <div className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhuma unidade cadastrada ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-canvas border-b border-line text-[10.5px] uppercase tracking-wide text-muted font-mono">
                <th className="text-left px-4 py-2.5">Nome</th>
                <th className="text-left px-4 py-2.5">ASC COD.</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Nota Fiscal</th>
                <th className="text-right px-4 py-2.5">Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((u) => (
                <tr key={u.id} className="border-b border-line last:border-0 hover:bg-canvas">
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                        <Building2 size={15} />
                      </div>
                      {u.nome}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-muted">{u.asc_cod}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => alternarAtivo(u)}
                      className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded"
                      style={{
                        background: u.ativo ? "rgba(63,167,150,0.14)" : "var(--danger-soft)",
                        color: u.ativo ? "#2C7C6E" : "var(--danger)"
                      }}
                    >
                      {u.ativo ? "Ativa" : "Inativa"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => alternarObrigaNotaFiscal(u)}
                      title="Clique pra alternar"
                      className="text-[10.5px] font-mono font-bold px-2 py-0.5 rounded"
                      style={{
                        background: u.obriga_nota_fiscal ? "rgba(67,56,202,0.14)" : "rgba(139,147,161,0.14)",
                        color: u.obriga_nota_fiscal ? "#4338CA" : "#5D6572"
                      }}
                    >
                      {u.obriga_nota_fiscal ? "Obrigatória" : "Opcional"}
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1.5">
                      <button title="Editar" onClick={() => abrirEdicao(u)} className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-ink hover:bg-canvas">
                        <Pencil size={15} />
                      </button>
                      <button title="Excluir" onClick={() => setConfirmarExclusao(u)} className="w-8 h-8 flex items-center justify-center rounded-lg text-danger hover:bg-danger-soft">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editando ? "Editar unidade" : "Nova unidade"}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setModalAberto(false)}>Cancelar</button>
            <button className="btn-primary" disabled={salvando} onClick={salvar}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="field-label">Nome da unidade</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: ESC Santos" />
          </div>
          <div>
            <label className="field-label">ASC COD.</label>
            <input
              className="field-input font-mono"
              value={ascCod}
              onChange={(e) => setAscCod(e.target.value.replace(/\D/g, "").slice(0, 7))}
              placeholder="Ex: 3197760"
              inputMode="numeric"
            />
            <p className="text-[11px] text-muted mt-1">7 números — usado pra identificar essa unidade nas planilhas de Carregar Bases.</p>
          </div>
          <div>
            <label className="field-label">Essa unidade é obrigada a emitir Nota Fiscal de venda?</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setObrigaNotaFiscal(true)}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition"
                style={{
                  borderColor: obrigaNotaFiscal ? "#4338CA" : "var(--line)",
                  background: obrigaNotaFiscal ? "rgba(67,56,202,0.10)" : "transparent",
                  color: obrigaNotaFiscal ? "#4338CA" : "var(--muted)"
                }}
              >
                <FileCheck2 size={15} />
                Sim, obrigatória
              </button>
              <button
                type="button"
                onClick={() => setObrigaNotaFiscal(false)}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition"
                style={{
                  borderColor: !obrigaNotaFiscal ? "var(--accent)" : "var(--line)",
                  background: !obrigaNotaFiscal ? "var(--accent-soft)" : "transparent",
                  color: !obrigaNotaFiscal ? "var(--accent)" : "var(--muted)"
                }}
              >
                Não, opcional
              </button>
            </div>
            <p className="text-[11px] text-muted mt-1">
              Se for obrigatória, o sistema controla no menu Fiscal os pedidos liberados que ainda faltam emitir a NF. Se for opcional, a emissão pode ser registrada mas não entra nesse controle.
            </p>
          </div>
          {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}
        </div>
      </Modal>

      <Modal
        open={!!confirmarExclusao}
        onClose={() => setConfirmarExclusao(null)}
        title="Excluir unidade?"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setConfirmarExclusao(null)}>Cancelar</button>
            <button className="btn-primary" style={{ background: "var(--danger)" }} disabled={salvando} onClick={excluir}>
              {salvando ? "Excluindo..." : "Excluir"}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Isso vai excluir a unidade <b>{confirmarExclusao?.nome}</b> permanentemente. Se já existirem pedidos ou usuários vinculados a ela, considere desativar em vez de excluir.
        </p>
      </Modal>
    </AppShell>
  );
}
