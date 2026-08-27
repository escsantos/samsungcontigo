"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, Trash2, Check, DatabaseZap } from "lucide-react";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { CARGOS } from "../../../lib/permissions";

const TABELAS = [
  { id: "lancamentos", nome: "Lançamentos", descricao: "Todos os registros de OS e pagamentos digitados no sistema." },
  { id: "metas", nome: "Metas", descricao: "Metas mensais cadastradas por unidade." },
  { id: "log_auditoria", nome: "Log de auditoria", descricao: "Histórico de alterações registrado no sistema." },
  { id: "solicitacoes_senha", nome: "Solicitações de senha", descricao: "Pedidos de \"esqueci minha senha\" já resolvidos ou não." },
];

const FRASE_CONFIRMACAO = "EXCLUIR";

function Conteudo() {
  const { usuario } = useSessao();
  const [contagens, setContagens] = useState({});
  const [selecionadas, setSelecionadas] = useState([]);
  const [etapa, setEtapa] = useState(0); // 0 = fechado, 1 = primeira confirmação, 2 = segunda confirmação
  const [textoConfirmacao, setTextoConfirmacao] = useState("");
  const [executando, setExecutando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  async function carregarContagens() {
    setCarregando(true);
    const resultado = {};
    for (const t of TABELAS) {
      const { count } = await supabase.from(t.id).select("id", { count: "exact", head: true });
      resultado[t.id] = count || 0;
    }
    setContagens(resultado);
    setCarregando(false);
  }

  useEffect(() => {
    carregarContagens();
  }, []);

  const permitido = usuario.cargo === CARGOS.ADMINISTRADOR;

  function alternarTabela(id) {
    setSelecionadas((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  }

  function abrirConfirmacao() {
    if (selecionadas.length === 0) return;
    setTextoConfirmacao("");
    setEtapa(1);
  }

  async function executarLimpeza() {
    setExecutando(true);
    for (const id of selecionadas) {
      await supabase.from(id).delete().not("id", "is", null);
    }
    setExecutando(false);
    setEtapa(0);
    setSelecionadas([]);
    carregarContagens();
  }

  if (!permitido) {
    return <p className="text-sm text-muted">Somente o Administrador do sistema acessa a manutenção do banco de dados.</p>;
  }

  const tabelasSelecionadas = TABELAS.filter((t) => selecionadas.includes(t.id));
  const totalRegistrosSelecionados = tabelasSelecionadas.reduce((s, t) => s + (contagens[t.id] || 0), 0);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
        <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
          <DatabaseZap size={22} className="text-danger" /> Manutenção do banco de dados
        </h1>
        <p className="text-sm text-muted mt-1">Apague dados de teste antes de começar a usar o sistema de verdade — ação restrita ao Administrador.</p>
      </div>

      <div className="rounded-lg bg-danger-soft text-danger text-sm px-4 py-3 mb-6 flex items-start gap-2">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
        <p>Essa ação apaga os dados permanentemente e não pode ser desfeita. Cadastros estruturais (unidades, usuários, categorias, tipos de serviço, modelos) não aparecem aqui — não são apagados por esta tela.</p>
      </div>

      <div className="card divide-y divide-line mb-6">
        {TABELAS.map((t) => {
          const marcada = selecionadas.includes(t.id);
          return (
            <label key={t.id} className={`flex items-center gap-3 p-4 cursor-pointer transition ${marcada ? "bg-danger-soft/30" : ""}`}>
              <input type="checkbox" checked={marcada} onChange={() => alternarTabela(t.id)} className="sr-only" />
              <span className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 ${marcada ? "bg-danger border-danger" : "border-line bg-white"}`}>
                {marcada && <Check size={13} strokeWidth={3} className="text-white" />}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-ink">{t.nome}</p>
                <p className="text-xs text-muted">{t.descricao}</p>
              </div>
              <span className="font-mono-num text-sm text-muted shrink-0">
                {carregando ? "…" : `${contagens[t.id] ?? 0} registro(s)`}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          className="btn flex items-center gap-1.5 text-danger border-danger/30 hover:bg-danger-soft"
          onClick={abrirConfirmacao}
          disabled={selecionadas.length === 0}
        >
          <Trash2 size={14} /> Limpar tabelas selecionadas
        </button>
      </div>

      {etapa === 1 && (
        <Modal titulo="Confirmar exclusão" onFechar={() => setEtapa(0)}>
          <div className="space-y-4">
            <div className="flex items-start gap-2 text-sm text-danger">
              <AlertTriangle size={18} className="shrink-0 mt-0.5" />
              <p>Você está prestes a apagar permanentemente <strong>{totalRegistrosSelecionados} registro(s)</strong> das seguintes tabelas:</p>
            </div>
            <ul className="text-sm space-y-1 bg-canvas rounded-lg p-3">
              {tabelasSelecionadas.map((t) => (
                <li key={t.id} className="flex justify-between">
                  <span>{t.nome}</span>
                  <span className="font-mono-num text-muted">{contagens[t.id] ?? 0} registro(s)</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setEtapa(0)}>Cancelar</button>
              <button className="btn flex items-center gap-1.5 text-danger border-danger/30 hover:bg-danger-soft" onClick={() => setEtapa(2)}>
                Sim, quero continuar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {etapa === 2 && (
        <Modal titulo="Última confirmação" onFechar={() => setEtapa(0)}>
          <div className="space-y-4">
            <p className="text-sm text-ink">
              Para confirmar de vez, digite <span className="font-mono-num font-semibold">{FRASE_CONFIRMACAO}</span> no campo abaixo:
            </p>
            <input
              className="field-input"
              value={textoConfirmacao}
              onChange={(e) => setTextoConfirmacao(e.target.value.toUpperCase())}
              placeholder={FRASE_CONFIRMACAO}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setEtapa(0)}>Cancelar</button>
              <button
                className="btn-primary bg-danger hover:bg-danger flex items-center gap-1.5 disabled:opacity-40"
                disabled={textoConfirmacao !== FRASE_CONFIRMACAO || executando}
                onClick={executarLimpeza}
              >
                <Trash2 size={14} /> {executando ? "Excluindo…" : "Confirmar exclusão definitiva"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function ManutencaoPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
