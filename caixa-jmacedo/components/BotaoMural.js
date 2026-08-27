"use client";
import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Bell, BellOff, X, Smile, AtSign } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

const INTERVALO_VERIFICACAO_MS = 20000;

const EMOJIS = [
  "😀", "😂", "😅", "😊", "😍", "🤔", "😮", "😢", "😡", "👍",
  "👎", "🙏", "👏", "💪", "🔥", "🎉", "✅", "❌", "⚠️", "💰",
  "📦", "🛠️", "📞", "⏰", "💬", "❤️", "😴", "🤝", "👀", "🚀",
];

function formatarDataHora(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (mesmoDia) return hora;
  return `${d.toLocaleDateString("pt-BR")} ${hora}`;
}

/** Quebra o texto da mensagem em pedaços, destacando @menções válidas. */
function renderizarTexto(texto, logins) {
  const partes = texto.split(/(@[a-zA-Z0-9._]+)/g);
  return partes.map((parte, i) => {
    if (parte.startsWith("@") && logins.has(parte.slice(1).toLowerCase())) {
      return (
        <span key={i} className="text-gold-strong font-semibold bg-gold-soft/50 rounded px-1">
          {parte}
        </span>
      );
    }
    return <span key={i}>{parte}</span>;
  });
}

export default function BotaoMural() {
  const { usuario } = useSessao();
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [mencoesNaoLidas, setMencoesNaoLidas] = useState(0);
  const [notificacoesAtivas, setNotificacoesAtivas] = useState(true);
  const [carregandoInicial, setCarregandoInicial] = useState(true);
  const [usuariosLista, setUsuariosLista] = useState([]);
  const [sugestoesArroba, setSugestoesArroba] = useState([]);
  const [mostrarArroba, setMostrarArroba] = useState(false);
  const [mostrarEmoji, setMostrarEmoji] = useState(false);
  const listaRef = useRef(null);
  const textareaRef = useRef(null);

  const loginsValidos = new Set(usuariosLista.map((u) => u.login.toLowerCase()));

  async function carregarUsuariosParaMencao() {
    const { data, error } = await supabase
      .from("usuarios")
      .select("id, nome_completo, login")
      .eq("ativo", true)
      .order("nome_completo");
    if (error) {
      console.error("Erro ao carregar usuários para @menção:", error.message);
      return;
    }
    setUsuariosLista(data || []);
  }

  useEffect(() => {
    carregarUsuariosParaMencao();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function garantirStatus() {
    const { data } = await supabase.from("mural_status_usuario").select("*").eq("usuario_id", usuario.id).maybeSingle();
    if (data) {
      setNotificacoesAtivas(data.notificacoes_ativas);
      return data;
    }
    const { data: criado } = await supabase
      .from("mural_status_usuario")
      .insert({ usuario_id: usuario.id })
      .select()
      .single();
    return criado;
  }

  async function verificarNaoLidas() {
    const status = await garantirStatus();
    if (!status || status.notificacoes_ativas === false) {
      setNaoLidas(0);
      setMencoesNaoLidas(0);
      return;
    }
    const { count } = await supabase
      .from("mural_mensagens")
      .select("id", { count: "exact", head: true })
      .gt("criado_em", status.ultima_leitura)
      .neq("usuario_id", usuario.id);
    setNaoLidas(count || 0);

    const { count: mencoes } = await supabase
      .from("mural_notificacoes")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuario.id)
      .eq("lida", false);
    setMencoesNaoLidas(mencoes || 0);
  }

  useEffect(() => {
    verificarNaoLidas().finally(() => setCarregandoInicial(false));
    const intervalo = setInterval(verificarNaoLidas, INTERVALO_VERIFICACAO_MS);
    return () => clearInterval(intervalo);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function carregarMensagens() {
    const { data } = await supabase
      .from("mural_mensagens")
      .select("id, texto, criado_em, usuarios(nome_completo, login)")
      .order("criado_em", { ascending: true })
      .limit(200);
    setMensagens(data || []);
    setTimeout(() => {
      if (listaRef.current) listaRef.current.scrollTop = listaRef.current.scrollHeight;
    }, 50);
  }

  async function abrirMural() {
    setAberto(true);
    await Promise.all([carregarMensagens(), carregarUsuariosParaMencao()]);
    await supabase
      .from("mural_status_usuario")
      .upsert({ usuario_id: usuario.id, ultima_leitura: new Date().toISOString() }, { onConflict: "usuario_id" });
    await supabase.from("mural_notificacoes").update({ lida: true }).eq("usuario_id", usuario.id).eq("lida", false);
    setNaoLidas(0);
    setMencoesNaoLidas(0);
  }

  async function enviar(e) {
    e.preventDefault();
    const conteudo = texto.trim();
    if (!conteudo) return;
    setEnviando(true);
    const { error } = await supabase.from("mural_mensagens").insert({ usuario_id: usuario.id, texto: conteudo });
    setEnviando(false);
    if (error) {
      alert("Não foi possível enviar: " + error.message);
      return;
    }
    setTexto("");
    setMostrarArroba(false);
    setMostrarEmoji(false);
    await carregarMensagens();
    await supabase
      .from("mural_status_usuario")
      .upsert({ usuario_id: usuario.id, ultima_leitura: new Date().toISOString() }, { onConflict: "usuario_id" });
  }

  async function alternarNotificacoes() {
    const novoValor = !notificacoesAtivas;
    setNotificacoesAtivas(novoValor);
    await supabase
      .from("mural_status_usuario")
      .upsert({ usuario_id: usuario.id, notificacoes_ativas: novoValor }, { onConflict: "usuario_id" });
    if (!novoValor) {
      setNaoLidas(0);
      setMencoesNaoLidas(0);
    }
  }

  function aoDigitar(e) {
    const valor = e.target.value;
    const cursor = e.target.selectionStart;
    setTexto(valor);

    const antesCursor = valor.slice(0, cursor);
    const match = antesCursor.match(/@([a-zA-Z0-9._]*)$/);
    if (match) {
      const termo = match[1].toLowerCase();
      const filtradas = usuariosLista
        .filter((u) => u.login.toLowerCase().includes(termo) || u.nome_completo.toLowerCase().includes(termo))
        .slice(0, 6);
      setSugestoesArroba(filtradas);
      setMostrarArroba(filtradas.length > 0);
    } else {
      setMostrarArroba(false);
    }
  }

  function selecionarMencao(u) {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : texto.length;
    const antes = texto.slice(0, cursor);
    const depois = texto.slice(cursor);
    const novoAntes = antes.replace(/@([a-zA-Z0-9._]*)$/, `@${u.login} `);
    const novoTexto = novoAntes + depois;
    setTexto(novoTexto);
    setMostrarArroba(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = novoAntes.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function inserirEmoji(emoji) {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : texto.length;
    const novo = texto.slice(0, cursor) + emoji + texto.slice(cursor);
    setTexto(novo);
    setMostrarEmoji(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = cursor + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <>
      <button
        onClick={abrirMural}
        title={mencoesNaoLidas > 0 ? "Você foi mencionado no mural" : "Mural — mensagens da equipe"}
        className="relative text-muted hover:text-gold transition"
      >
        <MessageCircle size={19} />
        {!carregandoInicial && mencoesNaoLidas > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-gold-strong text-white text-[10px] flex items-center justify-center font-semibold shadow-[0_0_0_2px_white] animate-pulse">
            @{mencoesNaoLidas > 9 ? "9+" : mencoesNaoLidas}
          </span>
        ) : (
          !carregandoInicial && naoLidas > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] flex items-center justify-center font-medium">
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          )
        )}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6" onClick={() => setAberto(false)}>
          <div className="absolute inset-0 bg-ink/20" />
          <div
            className="relative w-full max-w-sm bg-white rounded-xl2 shadow-2xl border border-line flex flex-col mt-14 max-h-[75vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
              <div className="flex items-center gap-2">
                <MessageCircle size={16} className="text-gold" />
                <p className="font-display text-sm font-semibold text-ink">Mural da equipe</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={alternarNotificacoes}
                  title={notificacoesAtivas ? "Desligar notificações" : "Ligar notificações"}
                  className="text-muted hover:text-ink transition p-1"
                >
                  {notificacoesAtivas ? <Bell size={15} /> : <BellOff size={15} />}
                </button>
                <button onClick={() => setAberto(false)} className="text-muted hover:text-ink transition p-1">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div ref={listaRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px]">
              {mensagens.length === 0 && (
                <p className="text-sm text-muted text-center py-8">Nenhuma mensagem ainda — seja o primeiro a escrever.</p>
              )}
              {mensagens.map((m) => {
                const meMencionou = new RegExp(`(^|\\s)@${usuario.login}(\\s|$)`, "i").test(m.texto);
                return (
                  <div key={m.id} className={`text-sm ${meMencionou ? "bg-gold-soft/30 -mx-2 px-2 py-1.5 rounded-lg" : ""}`}>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-semibold text-ink">{m.usuarios?.nome_completo || "—"}</span>
                      <span className="text-[11px] text-muted font-mono-num">@{m.usuarios?.login}</span>
                      <span className="text-[11px] text-muted ml-auto shrink-0">{formatarDataHora(m.criado_em)}</span>
                    </div>
                    <p className="text-ink mt-0.5 break-words">{renderizarTexto(m.texto, loginsValidos)}</p>
                  </div>
                );
              })}
            </div>

            <form onSubmit={enviar} className="border-t border-line p-3 shrink-0 relative">
              {mostrarArroba && (
                <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-line rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                  {sugestoesArroba.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      onClick={() => selecionarMencao(u)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-canvas transition flex items-center gap-2"
                    >
                      <span className="font-medium text-ink">{u.nome_completo}</span>
                      <span className="text-xs text-muted font-mono-num">@{u.login}</span>
                    </button>
                  ))}
                </div>
              )}

              {mostrarEmoji && (
                <div className="absolute bottom-full right-3 mb-1 bg-white border border-line rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 w-56">
                  {EMOJIS.map((em) => (
                    <button
                      type="button"
                      key={em}
                      onClick={() => inserirEmoji(em)}
                      className="text-lg hover:bg-canvas rounded p-1 transition"
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-1.5">
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setMostrarArroba((v) => !v); setSugestoesArroba(usuariosLista.slice(0, 6)); setMostrarEmoji(false); }}
                    title="Mencionar alguém"
                    className="text-muted hover:text-gold transition p-1.5 rounded hover:bg-canvas"
                  >
                    <AtSign size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMostrarEmoji((v) => !v); setMostrarArroba(false); }}
                    title="Inserir emoji"
                    className="text-muted hover:text-gold transition p-1.5 rounded hover:bg-canvas"
                  >
                    <Smile size={16} />
                  </button>
                </div>
                <textarea
                  ref={textareaRef}
                  className="field-input flex-1 resize-none text-sm"
                  rows={2}
                  maxLength={280}
                  placeholder="Escreva uma mensagem para a equipe… use @ para marcar alguém"
                  value={texto}
                  onChange={aoDigitar}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !mostrarArroba) {
                      e.preventDefault();
                      enviar(e);
                    }
                  }}
                />
                <button type="submit" className="btn-primary w-9 h-9 p-0 flex items-center justify-center shrink-0" disabled={enviando || !texto.trim()}>
                  <Send size={15} />
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{texto.length}/280</p>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
