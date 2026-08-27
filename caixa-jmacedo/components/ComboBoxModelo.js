"use client";
import { useEffect, useRef, useState } from "react";
import { Search, PlusCircle, Check } from "lucide-react";
import Modal from "./Modal";
import { supabase } from "../lib/supabaseClient";
import { useSessao } from "../lib/SessaoContext";

/**
 * Campo de busca de Modelo com autocomplete.
 *
 * `categoriaIdsBusca` controla em quais categorias a busca acontece:
 *   - undefined/omitido → busca só em `categoriaId` (padrão)
 *   - array de ids → busca em todas elas (ex: TV + DTV pareadas)
 *   - null → busca em TODAS as categorias (categorias "somente IH"
 *     sem par definido, para reaproveitar o cadastro do balcão)
 *
 * Se não encontrar nada:
 *   - login de IH → cadastra o modelo direto (com confirmação),
 *     sem precisar de aprovação — pensado pro técnico em campo.
 *   - demais → cria uma solicitação pendente, que quem administra
 *     Modelos aprova depois em Configurações > Modelos.
 */
export default function ComboBoxModelo({ categoriaId, unidadeId, modeloId, onSelecionar, disabled, categoriaIdsBusca }) {
  const { usuario } = useSessao();
  const ehIH = usuario?.linha === "ih";
  const [modelos, setModelos] = useState([]);
  const [carregandoModelos, setCarregandoModelos] = useState(false);
  const [texto, setTexto] = useState("");
  const [aberto, setAberto] = useState(false);
  const [solicitado, setSolicitado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const containerRef = useRef(null);

  const chaveBusca = categoriaIdsBusca === null ? "todas" : (categoriaIdsBusca || [categoriaId]).join(",");

  useEffect(() => {
    setTexto("");
    setSolicitado(false);
    if (!categoriaId) {
      setModelos([]);
      return;
    }
    setCarregandoModelos(true);
    let query = supabase.from("modelos").select("*").order("nome");
    if (categoriaIdsBusca === null) {
      // busca em todas as categorias
    } else if (Array.isArray(categoriaIdsBusca) && categoriaIdsBusca.length > 0) {
      query = query.in("categoria_id", categoriaIdsBusca);
    } else {
      query = query.eq("categoria_id", categoriaId);
    }
    query.then(({ data }) => {
      setModelos(data || []);
      setCarregandoModelos(false);
    });
  }, [categoriaId, chaveBusca]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (modeloId) {
      const m = modelos.find((x) => x.id === modeloId);
      if (m) setTexto(m.nome);
    }
  }, [modeloId, modelos]);

  useEffect(() => {
    function aoClicarFora(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setAberto(false);
    }
    window.addEventListener("mousedown", aoClicarFora);
    return () => window.removeEventListener("mousedown", aoClicarFora);
  }, []);

  const filtrados = texto.trim()
    ? modelos.filter((m) => m.nome.toLowerCase().includes(texto.trim().toLowerCase()))
    : modelos;

  function escolher(m) {
    setTexto(m.nome);
    setAberto(false);
    onSelecionar(m.id);
  }

  async function solicitarInclusao() {
    if (!texto.trim() || !categoriaId) return;
    setEnviando(true);
    const { error } = await supabase.from("solicitacoes_modelo").insert({
      categoria_id: categoriaId,
      nome: texto.trim().toUpperCase(),
      unidade_id: unidadeId || null,
      solicitado_por: usuario?.id || null,
    });
    setEnviando(false);
    if (error) {
      alert("Não foi possível enviar o pedido: " + error.message);
      return;
    }
    setConfirmando(false);
    setSolicitado(true);
    setAberto(false);
  }

  async function cadastrarDireto() {
    if (!texto.trim() || !categoriaId) return;
    setEnviando(true);
    const nomeNormalizado = texto.trim().toUpperCase();
    const { data, error } = await supabase
      .from("modelos")
      .insert({ categoria_id: categoriaId, nome: nomeNormalizado })
      .select()
      .single();

    if (error?.code === "23505") {
      // já existe um modelo igual nessa categoria — busca e seleciona em vez de dar erro
      const { data: existente } = await supabase
        .from("modelos")
        .select("*")
        .eq("categoria_id", categoriaId)
        .eq("nome", nomeNormalizado)
        .maybeSingle();
      setEnviando(false);
      if (existente) {
        setModelos((atual) => (atual.some((m) => m.id === existente.id) ? atual : [...atual, existente]));
        setConfirmando(false);
        escolher(existente);
        return;
      }
    }

    setEnviando(false);
    if (error) {
      alert("Não foi possível cadastrar: " + error.message);
      return;
    }
    setModelos((atual) => [...atual, data]);
    setConfirmando(false);
    escolher(data);
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          className="field-input pl-8"
          value={texto}
          disabled={disabled}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            setSolicitado(false);
            onSelecionar("");
          }}
          onFocus={() => setAberto(true)}
          placeholder={categoriaId ? "Digite para buscar…" : "Escolha a categoria primeiro"}
        />
      </div>

      {aberto && !disabled && (
        <div className="absolute z-20 mt-1 w-full card max-h-56 overflow-y-auto shadow-lg">
          {carregandoModelos ? (
            <p className="p-3 text-sm text-muted">Carregando…</p>
          ) : filtrados.length > 0 ? (
            filtrados.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => escolher(m)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-canvas transition flex items-center justify-between"
              >
                {m.nome}
                {m.id === modeloId && <Check size={13} className="text-gold" />}
              </button>
            ))
          ) : (
            <div className="p-3 text-sm text-muted">
              <p className="mb-2">Nenhum modelo encontrado{texto.trim() ? ` para "${texto.trim()}"` : ""}.</p>
              {texto.trim() && !solicitado && (
                <button
                  type="button"
                  onClick={() => setConfirmando(true)}
                  className="btn text-xs flex items-center gap-1.5 text-gold border-gold/40 hover:bg-gold-soft/40"
                >
                  <PlusCircle size={13} /> {ehIH ? `Cadastrar modelo "${texto.trim()}"` : `Solicitar cadastro de "${texto.trim()}"`}
                </button>
              )}
              {solicitado && (
                <p className="text-teal text-xs flex items-center gap-1.5">
                  <Check size={13} /> {ehIH ? "Modelo cadastrado!" : "Pedido enviado! Quem administra Modelos vai aprovar."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {confirmando && (
        <Modal titulo={ehIH ? "Confirmar cadastro do modelo" : "Confirmar solicitação"} onFechar={() => setConfirmando(false)} largura="max-w-sm">
          {ehIH ? (
            <>
              <p className="text-sm text-ink mb-1">
                Cadastrar o modelo <span className="font-semibold">"{texto.trim()}"</span> agora, direto no sistema?
              </p>
              <p className="text-xs text-muted mb-5">
                Como você é do atendimento IH, o cadastro é feito na hora, sem precisar de aprovação — só confirme que o nome do modelo está completo e correto (igual você já cadastra no GSPN).
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-ink mb-1">
                Solicitar o cadastro do modelo <span className="font-semibold">"{texto.trim()}"</span>?
              </p>
              <p className="text-xs text-muted mb-5">
                O pedido fica pendente até quem administra Modelos aprovar.
              </p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn text-sm" onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary text-sm" onClick={ehIH ? cadastrarDireto : solicitarInclusao} disabled={enviando}>
              {enviando ? "Enviando…" : ehIH ? "Confirmar cadastro" : "Confirmar solicitação"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
