"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "../../../components/AppShell";
import Modal from "../../../components/Modal";
import { Check, Copy, CopyCheck, FileSpreadsheet, Pencil, Search, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useSessao } from "../../../lib/SessaoContext";
import { gerarLogin } from "../../../lib/textoUtil";
import {
  podeConfigUsuarios,
  CARGOS,
  CARGO_LABELS,
  rotuloCargo,
  limiteUnidadesPorCargo,
  podeVerTodasUnidades,
} from "../../../lib/permissions";

const SENHA_PADRAO = "jmacedo001";

function Conteudo() {
  const { usuario, unidades: minhasUnidades } = useSessao();
  const [usuarios, setUsuarios] = useState([]);
  const [unidades, setUnidades] = useState([]);

  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");
  const [cargo, setCargo] = useState(CARGOS.OPERACIONAL);
  const [unidadeIds, setUnidadeIds] = useState([]);
  const [linha, setLinha] = useState("");
  const [usuarioCriado, setUsuarioCriado] = useState(null); // { login, senha }
  const [copiado, setCopiado] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [edNome, setEdNome] = useState("");
  const [edSobrenome, setEdSobrenome] = useState("");
  const [edCargo, setEdCargo] = useState(CARGOS.OPERACIONAL);
  const [edUnidadeIds, setEdUnidadeIds] = useState([]);
  const [edLinha, setEdLinha] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [buscaUsuario, setBuscaUsuario] = useState("");

  // Supervisão/Gerência só enxergam e só mexem em usuários das próprias
  // unidades — Administrador/Diretor continuam vendo todo mundo
  const souGestorLimitado = [CARGOS.SUPERVISAO, CARGOS.GERENCIA].includes(usuario.cargo);
  const minhasUnidadesIds = minhasUnidades.map((u) => u.id);
  const unidadesSelecionaveis = souGestorLimitado ? unidades.filter((u) => minhasUnidadesIds.includes(u.id)) : unidades;
  const cargosAtribuiveis = souGestorLimitado
    ? Object.values(CARGOS).filter((c) => ![CARGOS.ADM, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(c))
    : Object.values(CARGOS);

  const edAcessoTodas = podeVerTodasUnidades(edCargo);
  const edLimite = limiteUnidadesPorCargo(edCargo);
  const podeEditarUsuario = [CARGOS.SUPERVISAO, CARGOS.GERENCIA, CARGOS.ADMINISTRADOR, CARGOS.DIRETOR].includes(usuario.cargo);
  const usuariosFiltrados = buscaUsuario.trim()
    ? usuarios.filter(
        (u) =>
          u.nome_completo.toLowerCase().includes(buscaUsuario.trim().toLowerCase()) ||
          u.login.toLowerCase().includes(buscaUsuario.trim().toLowerCase())
      )
    : usuarios;

  const acessoTodas = podeVerTodasUnidades(cargo);
  const limite = limiteUnidadesPorCargo(cargo);

  async function carregar() {
    if (souGestorLimitado) {
      if (minhasUnidadesIds.length === 0) {
        setUsuarios([]);
      } else {
        const { data: vinculos } = await supabase.from("usuario_unidades").select("usuario_id").in("unidade_id", minhasUnidadesIds);
        const idsPermitidos = [...new Set((vinculos || []).map((v) => v.usuario_id))];
        if (idsPermitidos.length === 0) {
          setUsuarios([]);
        } else {
          const { data: us } = await supabase.from("usuarios").select("*").in("id", idsPermitidos).order("nome_completo");
          setUsuarios(us || []);
        }
      }
    } else {
      const { data: us } = await supabase.from("usuarios").select("*").order("nome_completo");
      setUsuarios(us || []);
    }
    const { data: uns } = await supabase.from("unidades").select("*").order("nome");
    setUnidades(uns || []);
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    // ao trocar o cargo, ajusta a seleção de unidades às regras do cargo
    if (acessoTodas) setUnidadeIds([]);
    else if (limite === 1 && unidadeIds.length > 1) setUnidadeIds(unidadeIds.slice(0, 1));
  }, [cargo]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternarUnidade(id) {
    if (limite === 1) {
      setUnidadeIds([id]);
    } else {
      setUnidadeIds((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
    }
  }

  async function salvar(e) {
    e.preventDefault();
    const { data: sessao } = await supabase.auth.getSession();
    const resposta = await fetch("/api/criar-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session.access_token}` },
      body: JSON.stringify({ nome, sobrenome, cargo, unidadeIds: acessoTodas ? [] : unidadeIds, linha: linha || null }),
    });
    const resultado = await resposta.json();
    if (!resposta.ok) {
      alert("Erro ao criar usuário: " + resultado.erro);
      return;
    }
    setUsuarioCriado({ login: resultado.login, senha: resultado.senhaInicial });
    setNome("");
    setSobrenome("");
    setUnidadeIds([]);
    setLinha("");
    carregar();
  }

  async function abrirEdicao(usuarioAlvo) {
    const partes = usuarioAlvo.nome_completo.trim().split(" ");
    setEdNome(partes[0] || "");
    setEdSobrenome(partes.slice(1).join(" ") || "");
    setEdCargo(usuarioAlvo.cargo);
    setEdLinha(usuarioAlvo.linha || "");
    const { data: vinculos } = await supabase.from("usuario_unidades").select("unidade_id").eq("usuario_id", usuarioAlvo.id);
    setEdUnidadeIds((vinculos || []).map((v) => v.unidade_id));
    setUsuarioEditando(usuarioAlvo);
  }

  function edAlternarUnidade(id) {
    if (edLimite === 1) {
      setEdUnidadeIds([id]);
    } else {
      setEdUnidadeIds((atual) => (atual.includes(id) ? atual.filter((u) => u !== id) : [...atual, id]));
    }
  }

  async function salvarEdicaoUsuario(e) {
    e.preventDefault();
    setSalvandoEdicao(true);
    const { data: sessao } = await supabase.auth.getSession();
    const resposta = await fetch("/api/editar-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session.access_token}` },
      body: JSON.stringify({
        usuarioId: usuarioEditando.id,
        nome: edNome,
        sobrenome: edSobrenome,
        cargo: edCargo,
        unidadeIds: edAcessoTodas ? [] : edUnidadeIds,
        linha: edLinha || null,
      }),
    });
    const resultado = await resposta.json();
    setSalvandoEdicao(false);
    if (!resposta.ok) {
      alert("Erro ao editar usuário: " + resultado.erro);
      return;
    }
    setUsuarioEditando(null);
    carregar();
  }

  async function copiarMensagem() {
    if (!usuarioCriado) return;
    const link = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
    const mensagem =
      `Olá! Seu acesso ao sistema *Controle de Orçamentos (OW) — Balcão* foi criado.\n\n` +
      `*Login:* ${usuarioCriado.login}\n` +
      `*Senha inicial:* ${usuarioCriado.senha}\n` +
      `(você vai precisar trocar a senha no primeiro acesso)\n\n` +
      `*Acesse aqui:* ${link}`;
    await navigator.clipboard.writeText(mensagem);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function alternarBloqueio(usuarioAlvo) {
    const bloquear = usuarioAlvo.ativo;
    if (!window.confirm(bloquear ? `Bloquear o acesso de ${usuarioAlvo.nome_completo}?` : `Liberar o acesso de ${usuarioAlvo.nome_completo}?`)) return;
    const { data: sessao } = await supabase.auth.getSession();
    const resposta = await fetch("/api/bloquear-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session.access_token}` },
      body: JSON.stringify({ usuarioId: usuarioAlvo.id, bloquear }),
    });
    const resultado = await resposta.json();
    if (!resposta.ok) {
      alert("Erro: " + resultado.erro);
      return;
    }
    carregar();
  }

  async function resetarSenha(usuarioId) {
    if (!window.confirm("Redefinir a senha deste usuário para o padrão inicial?")) return;
    const { data: sessao } = await supabase.auth.getSession();
    const resposta = await fetch("/api/resetar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.session.access_token}` },
      body: JSON.stringify({ usuarioId }),
    });
    const resultado = await resposta.json();
    if (!resposta.ok) {
      alert("Erro ao redefinir senha: " + resultado.erro);
      return;
    }
    alert(`Senha redefinida para: ${resultado.senhaInicial}\nO usuário será obrigado a trocar no próximo acesso.`);
  }

  const permitido = podeConfigUsuarios(usuario.cargo);
  if (!permitido) {
    return <p className="text-sm text-muted">Somente Supervisão, Gerência, Administrador ou Diretor acessam o cadastro de usuários.</p>;
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted mb-1">Configurações</p>
          <h1 className="font-display text-2xl font-semibold text-ink">Usuários</h1>
          <p className="text-sm text-muted mt-1">{usuarios.length} usuários cadastrados · senha inicial padrão: <span className="font-mono-num">{SENHA_PADRAO}</span></p>
        </div>
        <Link href="/configuracoes/usuarios/relatorio" className="btn flex items-center gap-1.5 shrink-0">
          <FileSpreadsheet size={14} /> Relatório por unidade
        </Link>
      </div>

      <form onSubmit={salvar} className="card p-5 mb-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="field-label">Nome</label>
            <input className="field-input" value={nome} onChange={(e) => setNome(e.target.value.toUpperCase())} required />
          </div>
          <div>
            <label className="field-label">Sobrenome</label>
            <input className="field-input" value={sobrenome} onChange={(e) => setSobrenome(e.target.value.toUpperCase())} required />
          </div>
          <div>
            <label className="field-label">Cargo</label>
            <select className="field-input" value={cargo} onChange={(e) => setCargo(e.target.value)}>
              {cargosAtribuiveis.map((c) => (
                <option key={c} value={c}>{CARGO_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Linha fixa (opcional)</label>
            <select className="field-input" value={linha} onChange={(e) => setLinha(e.target.value)}>
              <option value="">— Nenhuma (gestão, vê CI e IH) —</option>
              <option value="ci">CI (balcão)</option>
              <option value="ih">IH (in-home)</option>
            </select>
          </div>
        </div>

        {nome && sobrenome && (
          <p className="text-xs text-muted">
            Login gerado: <span className="font-mono-num text-ink">{gerarLogin(nome, sobrenome)}</span>
          </p>
        )}

        <div>
          <label className="field-label">Unidades autorizadas</label>
          {acessoTodas ? (
            <p className="text-sm text-gold bg-gold-soft/40 rounded-lg px-3 py-2">
              {rotuloCargo(cargo)} tem acesso automático a todas as unidades.
            </p>
          ) : (
            <>
              <p className="text-xs text-muted mb-2">
                {limite === 1
                  ? "Este cargo tem acesso a apenas 1 unidade — escolha uma."
                  : "Marque uma ou mais lojas — para gerentes que cuidam de várias unidades."}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {unidadesSelecionaveis.map((u) => {
                  const marcado = unidadeIds.includes(u.id);
                  return (
                    <label key={u.id} className={`checkbox-tile ${marcado ? "is-checked" : ""}`}>
                      <input
                        type={limite === 1 ? "radio" : "checkbox"}
                        checked={marcado}
                        onChange={() => alternarUnidade(u.id)}
                        className="sr-only"
                      />
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                          marcado ? "bg-gold border-gold" : "border-line bg-white"
                        }`}
                      >
                        {marcado && <Check size={12} strokeWidth={3} className="text-white" />}
                      </span>
                      <span>{u.nome}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <button className="btn-primary" type="submit">Criar usuário</button>
        </div>
      </form>

      <div className="mb-3">
        <div className="relative max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            className="field-input pl-8 pr-8"
            list="lista-nomes-usuarios"
            placeholder="Buscar por nome…"
            value={buscaUsuario}
            onChange={(e) => setBuscaUsuario(e.target.value)}
          />
          {buscaUsuario && (
            <button
              type="button"
              onClick={() => setBuscaUsuario("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition"
            >
              <X size={14} />
            </button>
          )}
          <datalist id="lista-nomes-usuarios">
            {usuarios.map((u) => (
              <option key={u.id} value={u.nome_completo} />
            ))}
          </datalist>
        </div>
        {buscaUsuario && (
          <p className="text-xs text-muted mt-1">{usuariosFiltrados.length} de {usuarios.length} usuário(s)</p>
        )}
      </div>

      <div className="card divide-y divide-line">
        {usuariosFiltrados.map((u) => (
          <div key={u.id} className={`p-3 flex justify-between items-center text-sm ${!u.ativo ? "opacity-50" : ""}`}>
            <span>
              {u.nome_completo} <span className="text-muted font-mono-num">· {u.login}</span>
              {!u.ativo && <span className="text-danger text-xs ml-2">(bloqueado)</span>}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gold font-medium">{rotuloCargo(u.cargo)}</span>
              {u.linha && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${u.linha === "ih" ? "bg-teal-soft text-teal" : "bg-canvas text-muted"}`}>
                  {u.linha === "ih" ? "IH" : "CI"}
                </span>
              )}
              {podeEditarUsuario && (
                <button className="text-muted hover:text-gold transition p-1.5" title="Editar" onClick={() => abrirEdicao(u)}>
                  <Pencil size={15} />
                </button>
              )}
              <button className="btn text-xs" onClick={() => resetarSenha(u.id)}>Resetar senha</button>
              <button className={`btn text-xs ${u.ativo ? "text-danger" : "text-teal"}`} onClick={() => alternarBloqueio(u)}>
                {u.ativo ? "Bloquear" : "Desbloquear"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {usuarioCriado && (
        <Modal titulo="Usuário criado com sucesso" onFechar={() => setUsuarioCriado(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted">Login</p>
                <p className="font-mono-num font-medium">{usuarioCriado.login}</p>
              </div>
              <div>
                <p className="text-xs text-muted">Senha inicial</p>
                <p className="font-mono-num font-medium">{usuarioCriado.senha}</p>
              </div>
            </div>
            <p className="text-xs text-muted">O usuário será obrigado a trocar a senha no primeiro acesso.</p>
            <div className="rounded-lg bg-canvas p-3 text-sm">
              <p className="text-xs text-muted mb-1">Link de acesso ao sistema:</p>
              <a
                href={typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold font-medium underline break-all"
              >
                {typeof window !== "undefined" ? `${window.location.origin}/login` : "/login"}
              </a>
            </div>
            <div className="flex justify-between items-center">
              <button className="btn flex items-center gap-1.5" onClick={copiarMensagem}>
                {copiado ? <CopyCheck size={14} className="text-teal" /> : <Copy size={14} />}
                {copiado ? "Copiado! Cole no WhatsApp" : "Copiar mensagem para WhatsApp"}
              </button>
              <button className="btn-primary" onClick={() => setUsuarioCriado(null)}>Entendi</button>
            </div>
          </div>
        </Modal>
      )}

      {usuarioEditando && (
        <Modal titulo={`Editar ${usuarioEditando.nome_completo}`} subtitulo="Alterar nome, login, cargo ou unidades" onFechar={() => setUsuarioEditando(null)} largura="max-w-3xl">
          <form onSubmit={salvarEdicaoUsuario} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="field-label">Nome</label>
                <input className="field-input" value={edNome} onChange={(e) => setEdNome(e.target.value.toUpperCase())} required />
              </div>
              <div>
                <label className="field-label">Sobrenome</label>
                <input className="field-input" value={edSobrenome} onChange={(e) => setEdSobrenome(e.target.value.toUpperCase())} required />
              </div>
            </div>

            {edNome && edSobrenome && (
              <p className="text-xs text-muted">
                Novo login: <span className="font-mono-num text-ink">{gerarLogin(edNome, edSobrenome)}</span>
              </p>
            )}

            <div>
              <label className="field-label">Cargo</label>
              <select className="field-input" value={edCargo} onChange={(e) => setEdCargo(e.target.value)}>
                {cargosAtribuiveis.map((c) => (
                  <option key={c} value={c}>{CARGO_LABELS[c]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label">Linha fixa (opcional)</label>
              <select className="field-input" value={edLinha} onChange={(e) => setEdLinha(e.target.value)}>
                <option value="">— Nenhuma (gestão, vê CI e IH) —</option>
                <option value="ci">CI (balcão)</option>
                <option value="ih">IH (in-home)</option>
              </select>
            </div>

            <div>
              <label className="field-label">Unidades autorizadas</label>
              {edAcessoTodas ? (
                <p className="text-sm text-gold bg-gold-soft/40 rounded-lg px-3 py-2">
                  {rotuloCargo(edCargo)} tem acesso automático a todas as unidades.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-52 overflow-y-auto">
                  {unidadesSelecionaveis.map((u) => {
                    const marcado = edUnidadeIds.includes(u.id);
                    return (
                      <label key={u.id} className={`checkbox-tile ${marcado ? "is-checked" : ""}`}>
                        <input
                          type={edLimite === 1 ? "radio" : "checkbox"}
                          checked={marcado}
                          onChange={() => edAlternarUnidade(u.id)}
                          className="sr-only"
                        />
                        <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${marcado ? "bg-gold border-gold" : "border-line bg-white"}`}>
                          {marcado && <Check size={12} strokeWidth={3} className="text-white" />}
                        </span>
                        <span>{u.nome}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setUsuarioEditando(null)}>Cancelar</button>
              <button type="submit" className="btn-primary" disabled={salvandoEdicao}>
                {salvandoEdicao ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default function CadastroUsuarios() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
