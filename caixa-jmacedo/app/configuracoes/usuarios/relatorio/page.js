"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Store, ShieldCheck } from "lucide-react";
import AppShell from "../../../../components/AppShell";
import { supabase } from "../../../../lib/supabaseClient";
import { useSessao } from "../../../../lib/SessaoContext";
import { podeConfigUsuarios, CARGO_LABELS, rotuloCargo, CARGOS } from "../../../../lib/permissions";

const ORDEM_CARGO = [CARGOS.DIRETOR, CARGOS.ADMINISTRADOR, CARGOS.GERENCIA, CARGOS.SUPERVISAO, CARGOS.OPERACIONAL];

function ordenar(usuarios) {
  return [...usuarios].sort((a, b) => {
    const dif = ORDEM_CARGO.indexOf(a.cargo) - ORDEM_CARGO.indexOf(b.cargo);
    return dif !== 0 ? dif : a.nome_completo.localeCompare(b.nome_completo);
  });
}

function paraCSV(unidades, usuariosPorUnidade, acessoGlobal) {
  const linhas = [["Unidade", "Nome", "Login", "Cargo", "Status"]];
  acessoGlobal.forEach((u) => linhas.push(["Todas as unidades", u.nome_completo, u.login, CARGO_LABELS[u.cargo], u.ativo ? "Ativo" : "Bloqueado"]));
  unidades.forEach((un) => {
    (usuariosPorUnidade[un.id] || []).forEach((u) =>
      linhas.push([un.nome, u.nome_completo, u.login, CARGO_LABELS[u.cargo], u.ativo ? "Ativo" : "Bloqueado"])
    );
  });
  const escapar = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return linhas.map((linha) => linha.map(escapar).join(";")).join("\n");
}

function Conteudo() {
  const { usuario, unidades: minhasUnidades } = useSessao();
  const [unidades, setUnidades] = useState([]);
  const [usuariosPorUnidade, setUsuariosPorUnidade] = useState({});
  const [acessoGlobal, setAcessoGlobal] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const souGestorLimitado = [CARGOS.SUPERVISAO, CARGOS.GERENCIA].includes(usuario.cargo);
  const minhasUnidadesIds = minhasUnidades.map((u) => u.id);

  useEffect(() => {
    (async () => {
      const { data: unsTodas } = await supabase.from("unidades").select("*").eq("ativo", true).order("nome");
      const uns = souGestorLimitado ? (unsTodas || []).filter((u) => minhasUnidadesIds.includes(u.id)) : unsTodas;
      const { data: todosUsuarios } = await supabase.from("usuarios").select("*").order("nome_completo");
      const { data: vinculosTodos } = await supabase.from("usuario_unidades").select("usuario_id, unidade_id");
      const vinculos = souGestorLimitado
        ? (vinculosTodos || []).filter((v) => minhasUnidadesIds.includes(v.unidade_id))
        : vinculosTodos;

      const mapaUsuarios = Object.fromEntries((todosUsuarios || []).map((u) => [u.id, u]));
      const porUnidade = {};
      (vinculos || []).forEach((v) => {
        if (!mapaUsuarios[v.usuario_id]) return;
        porUnidade[v.unidade_id] = porUnidade[v.unidade_id] || [];
        porUnidade[v.unidade_id].push(mapaUsuarios[v.usuario_id]);
      });
      Object.keys(porUnidade).forEach((id) => (porUnidade[id] = ordenar(porUnidade[id])));

      const global = souGestorLimitado
        ? []
        : ordenar((todosUsuarios || []).filter((u) => u.cargo === CARGOS.ADMINISTRADOR || u.cargo === CARGOS.DIRETOR));

      setUnidades(uns || []);
      setUsuariosPorUnidade(porUnidade);
      setAcessoGlobal(global);
      setCarregando(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function exportar() {
    const csv = "\uFEFF" + paraCSV(unidades, usuariosPorUnidade, acessoGlobal);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "relatorio-usuarios-caixa-jmacedo.csv";
    link.click();
  }

  const permitido = podeConfigUsuarios(usuario.cargo);
  if (!permitido) {
    return <p className="text-sm text-muted">Somente Supervisão, Gerência, Administrador ou Diretor acessam este relatório.</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <Link href="/configuracoes/usuarios" className="text-xs text-muted hover:text-gold inline-flex items-center gap-1 mb-2">
            <ArrowLeft size={12} /> Voltar para Usuários
          </Link>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Relatório de usuários</h1>
          <p className="text-sm text-muted mt-1">Organizado por unidade e nível de acesso.</p>
        </div>
        <button className="btn flex items-center gap-1.5 shrink-0" onClick={exportar}>
          <FileDown size={14} /> Exportar para Excel
        </button>
      </div>

      {carregando ? (
        <p className="text-sm text-muted">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {acessoGlobal.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 border-b border-line bg-gold-soft/40 flex items-center gap-2">
                <ShieldCheck size={15} className="text-gold-strong" />
                <p className="font-display text-sm font-semibold text-ink">Acesso a todas as unidades</p>
              </div>
              <div className="divide-y divide-line">
                {acessoGlobal.map((u) => (
                  <div key={u.id} className={`p-3 flex justify-between items-center text-sm ${!u.ativo ? "opacity-50" : ""}`}>
                    <span>{u.nome_completo} <span className="text-muted font-mono-num">· {u.login}</span></span>
                    <span className="text-xs text-gold font-medium">{rotuloCargo(u.cargo)}{!u.ativo && " · bloqueado"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unidades.map((un) => {
            const lista = usuariosPorUnidade[un.id] || [];
            if (lista.length === 0) return null;
            return (
              <div key={un.id} className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-line flex items-center gap-2">
                  <Store size={15} className="text-muted" />
                  <p className="font-display text-sm font-semibold text-ink">{un.nome}</p>
                  <span className="text-xs text-muted">({lista.length})</span>
                </div>
                <div className="divide-y divide-line">
                  {lista.map((u) => (
                    <div key={u.id} className={`p-3 flex justify-between items-center text-sm ${!u.ativo ? "opacity-50" : ""}`}>
                      <span>{u.nome_completo} <span className="text-muted font-mono-num">· {u.login}</span></span>
                      <span className="text-xs text-gold font-medium">{rotuloCargo(u.cargo)}{!u.ativo && " · bloqueado"}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RelatorioUsuariosPage() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
