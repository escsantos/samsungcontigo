"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ShieldAlert, ScrollText, LogIn, LogOut, Plus, Pencil, Trash2, Lock, Unlock, KeyRound,
  ArrowRightLeft, Receipt, Search, Download
} from "lucide-react";
import * as XLSX from "xlsx";
import { supabase, getPerfilAtual } from "../../../lib/supabaseClient";
import AppShell from "../../../components/AppShell";
import { PERIODOS, calcularIntervalo } from "../../../lib/periodo";

const ICONE_TIPO = {
  login: LogIn, logout: LogOut, criacao: Plus, edicao: Pencil, exclusao: Trash2,
  status: ArrowRightLeft, bloqueio: Lock, desbloqueio: Unlock, senha: KeyRound, pagamento: Receipt
};
const COR_TIPO = {
  login: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  logout: { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" },
  criacao: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  edicao: { bg: "rgba(46,109,168,0.14)", fg: "#2E6DA8" },
  exclusao: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  status: { bg: "rgba(99,102,241,0.14)", fg: "#4338CA" },
  bloqueio: { bg: "var(--danger-soft)", fg: "var(--danger)" },
  desbloqueio: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" },
  senha: { bg: "rgba(232,163,61,0.14)", fg: "#C2801F" },
  pagamento: { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" }
};

function fmtDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

export default function AuditoriaPage() {
  const [perfil, setPerfil] = useState(undefined);
  const [logs, setLogs] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [unidades, setUnidades] = useState([]);

  const [periodo, setPeriodo] = useState("semana");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroEntidade, setFiltroEntidade] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");
  const [busca, setBusca] = useState("");

  const intervalo = useMemo(() => calcularIntervalo(periodo, dataDe, dataAte), [periodo, dataDe, dataAte]);

  useEffect(() => {
    (async () => {
      setPerfil(await getPerfilAtual());
      const { data: unis } = await supabase.from("unidades").select("id, nome").order("nome");
      setUnidades(unis || []);
    })();
  }, []);

  useEffect(() => {
    if (perfil === undefined) return;
    if (!["Administrador", "Diretor", "Gerente"].includes(perfil?.cargo)) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil]);

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("auditoria_logs")
      .select("*, perfis(nome), unidades(nome)")
      .order("criado_em", { ascending: false })
      .limit(1000);
    setLogs(data || []);
    setCarregando(false);
  }

  const entidadesDisponiveis = useMemo(() => [...new Set(logs.map((l) => l.entidade))].sort(), [logs]);

  const filtrados = useMemo(() => {
    return logs.filter((l) => {
      if (intervalo) {
        const t = new Date(l.criado_em).getTime();
        if (t < intervalo.de.getTime() || t > intervalo.ate.getTime()) return false;
      }
      if (filtroTipo && l.tipo_evento !== filtroTipo) return false;
      if (filtroEntidade && l.entidade !== filtroEntidade) return false;
      if (filtroUnidade && String(l.unidade_id) !== filtroUnidade) return false;
      if (busca.trim()) {
        const t = busca.trim().toLowerCase();
        if (!(l.descricao || "").toLowerCase().includes(t) && !(l.perfis?.nome || "").toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [logs, intervalo, filtroTipo, filtroEntidade, filtroUnidade, busca]);

  function exportarExcel() {
    const linhas = filtrados.map((l) => ({
      Data: fmtDataHora(l.criado_em),
      Usuário: l.perfis?.nome || "—",
      Unidade: l.unidades?.nome || "—",
      Tipo: l.tipo_evento,
      Entidade: l.entidade,
      Descrição: l.descricao
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    ws["!cols"] = [{ wch: 18 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 50 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Auditoria");
    XLSX.writeFile(wb, `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  if (perfil === undefined) {
    return <AppShell titulo="Auditoria"><p className="text-muted text-sm">Carregando...</p></AppShell>;
  }

  if (perfil && !["Administrador", "Diretor", "Gerente"].includes(perfil.cargo)) {
    return (
      <AppShell titulo="Auditoria">
        <div className="card p-8 text-center max-w-md mx-auto mt-10">
          <ShieldAlert className="mx-auto mb-3 text-danger" size={28} />
          <p className="font-display font-semibold mb-1">Acesso restrito</p>
          <p className="text-sm text-muted">Só Administrador, Diretor e Gerente acessam a auditoria.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell titulo="Auditoria">
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          {PERIODOS.map((p) => (
            <button key={p.id} onClick={() => setPeriodo(p.id)} className={`chip ${periodo === p.id ? "chip-active" : ""}`}>
              {p.label}
            </button>
          ))}
          {periodo === "personalizado" && (
            <div className="flex items-center gap-2">
              <input type="date" className="field-input py-1.5 text-xs" value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
              <span className="text-xs text-muted">até</span>
              <input type="date" className="field-input py-1.5 text-xs" value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
            </div>
          )}
          <button className="btn-primary text-xs py-2 ml-auto" onClick={exportarExcel}>
            <Download size={14} />
            Exportar Excel
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="field-label">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input className="field-input pl-9" placeholder="Descrição ou usuário..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Tipo de evento</label>
            <select className="field-input" value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
              <option value="">Todos</option>
              {Object.keys(ICONE_TIPO).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Área</label>
            <select className="field-input" value={filtroEntidade} onChange={(e) => setFiltroEntidade(e.target.value)}>
              <option value="">Todas</option>
              {entidadesDisponiveis.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Unidade</label>
            <select className="field-input" value={filtroUnidade} onChange={(e) => setFiltroUnidade(e.target.value)}>
              <option value="">Todas</option>
              {unidades.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted mb-3">{filtrados.length} evento(s) (últimos 1000 carregados)</p>

      <div className="card overflow-hidden">
        {carregando ? (
          <p className="text-sm text-muted p-6">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <p className="text-sm text-muted p-6 text-center">Nenhum evento encontrado com esses filtros.</p>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-380px)]">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="bg-canvas border-b border-line text-[10px] uppercase tracking-wide text-muted font-mono">
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5" style={{ width: "14%" }}>Data/Hora</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5" style={{ width: "14%" }}>Usuário</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5" style={{ width: "10%" }}>Unidade</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5" style={{ width: "10%" }}>Tipo</th>
                  <th className="sticky top-0 bg-canvas text-left px-3 py-2.5" style={{ width: "52%" }}>Descrição</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((l) => {
                  const Icone = ICONE_TIPO[l.tipo_evento] || ScrollText;
                  const cor = COR_TIPO[l.tipo_evento] || { bg: "rgba(139,147,161,0.14)", fg: "#5D6572" };
                  return (
                    <tr key={l.id} className="border-b border-line last:border-0 hover:bg-canvas">
                      <td className="px-3 py-2.5 text-muted whitespace-nowrap">{fmtDataHora(l.criado_em)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap overflow-hidden text-ellipsis">{l.perfis?.nome || "—"}</td>
                      <td className="px-3 py-2.5 text-muted whitespace-nowrap overflow-hidden text-ellipsis">{l.unidades?.nome || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded inline-flex items-center gap-1" style={{ background: cor.bg, color: cor.fg }}>
                          <Icone size={10} />
                          {l.tipo_evento}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{l.descricao}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
