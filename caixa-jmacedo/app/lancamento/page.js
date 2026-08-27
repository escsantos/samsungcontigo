"use client";
import { useEffect, useRef, useState } from "react";
import { Save, ReceiptText, Store, CalendarDays, Hash, Tags, Boxes, Wrench, Wallet, CircleDollarSign, CreditCard, Layers, Landmark, StickyNote, Ticket, Pencil, Trash2, Plus, X, Route } from "lucide-react";
import AppShell from "../../components/AppShell";
import CurrencyInput from "../../components/CurrencyInput";
import ComboBoxModelo from "../../components/ComboBoxModelo";
import FormasPagamentoModal from "../../components/FormasPagamentoModal";
import { supabase } from "../../lib/supabaseClient";
import { useSessao } from "../../lib/SessaoContext";
import { podeLancarDataRetroativa } from "../../lib/permissions";
import { normalizarNumeroOS, REGRA_OS_TEXTO } from "../../lib/validacaoOS";
import { FORMAS_PAGAMENTO, BANDEIRAS, precisaParcelas as precisaParcelasFn, precisaBandeira as precisaBandeiraFn } from "../../lib/formasPagamento";
import { hojeBrasil as hoje } from "../../lib/fusoHorario";

let proximoIdLinha = 1;
function gerarIdLinha() {
  return proximoIdLinha++;
}

function Rotulo({ icone: Icone, children }) {
  return (
    <label className="field-label flex items-center gap-1.5">
      <Icone size={12} className="text-muted" /> {children}
    </label>
  );
}

function FormularioLancamento() {
  const { usuario, unidades, modoLinha } = useSessao();
  const [categorias, setCategorias] = useState([]);
  const [tiposServico, setTiposServico] = useState([]);
  const [carregandoTipos, setCarregandoTipos] = useState(false);

  // linha (CI/IH) deste lançamento: fixa pelo login, ou escolhida na tela
  // (só gestão vê a escolha — atendente dedicado nunca decide isso)
  const linhaFixaUsuario = usuario.linha || null;
  const [linhaOperacao, setLinhaOperacao] = useState(linhaFixaUsuario || (modoLinha === "ih" ? "ih" : "ci"));
  const precisaEscolherLinha = !linhaFixaUsuario;
  const unidadesDaLinha = unidades.filter((u) => (linhaOperacao === "ih" ? u.atende_ih : u.atende_ci));
  const categoriasVisiveis = categorias.filter((c) => {
    if (linhaFixaUsuario === "ih") return c.somente_ih || c.nome === "Acessório"; // login só-IH: categorias de IH + Acessório (não é exclusiva de nenhuma linha)
    if (linhaOperacao === "ih") return true; // gestão em modo IH: vê tudo
    return !c.somente_ih; // CI (fixo ou gestão em modo CI): esconde as exclusivas de IH
  });

  const unidadeUnica = unidadesDaLinha.length === 1;
  const [unidadeId, setUnidadeId] = useState("");
  const [data, setData] = useState(hoje());
  const [numeroOsDigitado, setNumeroOsDigitado] = useState("");
  const [erroOs, setErroOs] = useState(null);
  const [categoriaId, setCategoriaId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [formaPagamento, setFormaPagamento] = useState("");
  const [parcelas, setParcelas] = useState("");
  const [bandeira, setBandeira] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [formasPagamento, setFormasPagamento] = useState([]); // preenchido quando usa múltiplas formas
  const [mostrarModalFormas, setMostrarModalFormas] = useState(false);
  const [linhaEditando, setLinhaEditando] = useState(null);
  const snapshotEdicaoRef = useRef(null);
  const [saldoRestante, setSaldoRestante] = useState(null);
  const [orcamentoTravado, setOrcamentoTravado] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const dataEditavel = podeLancarDataRetroativa(usuario.cargo, usuario.linha);
  const precisaParcelasUnica = precisaParcelasFn(formaPagamento);
  const precisaBandeiraUnica = precisaBandeiraFn(formaPagamento);
  const usaMultiplasFormas = formasPagamento.length > 0;
  const totalFormas = formasPagamento.reduce((s, f) => s + (Number(f.valor) || 0), 0);
  const valorPagoEfetivo = usaMultiplasFormas ? totalFormas : Number(valorPago) || 0;

  useEffect(() => {
    if (unidadesDaLinha[0] && !unidadesDaLinha.some((u) => u.id === unidadeId)) {
      setUnidadeId(unidadesDaLinha[0].id);
    }
  }, [unidadesDaLinha, linhaOperacao]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!valorPago || Number(valorPago) === 0) {
      setFormaPagamento("");
      setParcelas("");
      setBandeira("");
    }
  }, [valorPago]);

  useEffect(() => {
    supabase.from("categorias").select("*").order("nome").then(({ data }) => setCategorias(data || []));
  }, []);

  // se a categoria escolhida for exclusiva de IH e a linha virar CI, zera a
  // seleção (a categoria não existe mais nas opções visíveis)
  useEffect(() => {
    if (categoriaId && !categoriasVisiveis.some((c) => c.id === categoriaId)) {
      setCategoriaId("");
    }
  }, [linhaOperacao]); // eslint-disable-line react-hooks/exhaustive-deps

  // tipos de serviço dependem da categoria escolhida (modelo é buscado pelo ComboBoxModelo)
  useEffect(() => {
    setTipoServicoId("");
    setModeloId("");
    if (!categoriaId) {
      setTiposServico([]);
      return;
    }
    setCarregandoTipos(true);
    supabase
      .from("tipos_servico")
      .select("*")
      .eq("categoria_id", categoriaId)
      .order("nome")
      .then(({ data }) => {
        setTiposServico(data || []);
        setCarregandoTipos(false);
      });
  }, [categoriaId]);

  // ao sair do campo de OS, só valida o formato — a checagem de saldo (que
  // depende também do tipo de serviço) roda em verificarSaldoOs()
  function aoSairCampoOS() {
    const resultado = normalizarNumeroOS(numeroOsDigitado);
    if (!resultado.valido) {
      setErroOs(resultado.erro);
      setSaldoRestante(null);
      setOrcamentoTravado(false);
      return;
    }
    setErroOs(null);
    setNumeroOsDigitado(resultado.valor);
  }

  // verifica se essa combinação (unidade + Nº OS + tipo de serviço) já tem
  // lançamento(s) — cada tipo de serviço da mesma OS é tratado como um
  // registro independente (ex: "taxa de análise" e "reparo" não dividem o
  // mesmo orçamento). Roda de novo sempre que o tipo de serviço muda,
  // porque ele normalmente só é escolhido depois do campo Nº OS.
  useEffect(() => {
    async function verificarSaldoOs() {
      const resultado = normalizarNumeroOS(numeroOsDigitado);
      if (!resultado.valido || !unidadeId || !tipoServicoId) {
        setSaldoRestante(null);
        setOrcamentoTravado(false);
        return;
      }
      const { data: existentes } = await supabase
        .from("lancamentos")
        .select("orcamento_aprovado, valor_pago")
        .eq("unidade_id", unidadeId)
        .eq("numero_os", resultado.valor)
        .eq("tipo_servico_id", tipoServicoId)
        .eq("linha", linhaOperacao);
      if (existentes && existentes.length > 0) {
        const totalPago = existentes.reduce((s, l) => s + Number(l.valor_pago), 0);
        const jaDefinido = existentes.find((l) => Number(l.orcamento_aprovado) > 0);
        if (jaDefinido) {
          const orcamentoOs = Number(jaDefinido.orcamento_aprovado);
          setOrcamento(orcamentoOs);
          setOrcamentoTravado(true);
          setSaldoRestante(orcamentoOs - totalPago);
        } else {
          setOrcamento("");
          setOrcamentoTravado(false);
          setSaldoRestante(null);
        }
      } else {
        setOrcamentoTravado(false);
        setSaldoRestante(null);
      }
    }
    verificarSaldoOs();
  }, [numeroOsDigitado, unidadeId, tipoServicoId, linhaOperacao]); // eslint-disable-line react-hooks/exhaustive-deps

  async function executarSalvar() {
    setMensagem(null);
    const resultado = normalizarNumeroOS(numeroOsDigitado);
    if (!resultado.valido) {
      setErroOs(resultado.erro);
      return;
    }
    if (!categoriaId || !tipoServicoId) {
      setMensagem({ tipo: "erro", texto: "Selecione a categoria e o tipo de serviço antes de salvar." });
      return;
    }
    if (!usaMultiplasFormas && Number(valorPago) > 0 && !formaPagamento) {
      setMensagem({ tipo: "erro", texto: "Selecione a forma de pagamento." });
      return;
    }
    if (usaMultiplasFormas && linhaEditando !== null) {
      setMensagem({ tipo: "erro", texto: "Finalize a edição da forma de pagamento antes de salvar." });
      return;
    }
    if (saldoRestante !== null && valorPagoEfetivo > saldoRestante) {
      setMensagem({ tipo: "erro", texto: `Valor lançado ultrapassa o saldo restante desta OS. Saldo disponível: R$ ${saldoRestante.toFixed(2)}. Corrija o valor.` });
      return;
    }

    setSalvando(true);
    const { error } = await supabase.from("lancamentos").insert({
      unidade_id: unidadeId,
      data,
      numero_os: resultado.valor,
      categoria_id: categoriaId,
      modelo_id: modeloId || null,
      tipo_servico_id: tipoServicoId,
      linha: linhaOperacao,
      orcamento_aprovado: Number(orcamento) || 0,
      valor_pago: valorPagoEfetivo,
      forma_pagamento: usaMultiplasFormas ? "MÚLTIPLAS" : (Number(valorPago) > 0 ? formaPagamento : null),
      parcelas: !usaMultiplasFormas && precisaParcelasUnica && parcelas ? Number(parcelas) : null,
      bandeira: !usaMultiplasFormas && precisaBandeiraUnica ? bandeira : null,
      formas_pagamento: usaMultiplasFormas ? formasPagamento.map(({ id, ...resto }) => resto) : null,
      observacoes: observacoes.trim() || null,
      atendente_id: usuario.id,
      criado_por: usuario.id,
    });
    setSalvando(false);

    if (error) {
      setMensagem({
        tipo: "erro",
        texto: error.message.includes("VALOR_EXCEDE_ORCAMENTO")
          ? "Valor lançado ultrapassa o orçamento aprovado da OS. Corrija o valor."
          : "Erro ao salvar: " + error.message,
      });
      return;
    }
    setMensagem({ tipo: "ok", texto: "Lançamento salvo." });
    setNumeroOsDigitado("");
    setData(hoje());
    setCategoriaId("");
    setModeloId("");
    setTipoServicoId("");
    setOrcamento("");
    setValorPago("");
    setFormaPagamento("");
    setParcelas("");
    setBandeira("");
    setObservacoes("");
    setFormasPagamento([]);
    setLinhaEditando(null);
    setSaldoRestante(null);
    setOrcamentoTravado(false);
  }

  function aoSubmeter(e) {
    e.preventDefault();
    executarSalvar();
  }

  // Enter no formulário pede confirmação antes de executar
  function aoTeclar(e) {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (window.confirm("Confirmar o lançamento?")) executarSalvar();
    }
  }

  function aoSalvarModalFormas(formas) {
    setFormasPagamento(formas.map((f) => ({ ...f, id: gerarIdLinha() })));
    setMostrarModalFormas(false);
    setLinhaEditando(null);
    setValorPago("");
    setFormaPagamento("");
    setParcelas("");
    setBandeira("");
  }

  function usarFormaUnica() {
    if (formasPagamento.length > 0 && !window.confirm("Remover as formas de pagamento já preenchidas e voltar a usar apenas uma?")) return;
    setFormasPagamento([]);
    setLinhaEditando(null);
  }

  function adicionarLinhaInline() {
    const nova = { id: gerarIdLinha(), valor: "", forma_pagamento: "", parcelas: null, bandeira: null };
    setFormasPagamento((fs) => [...fs, nova]);
    snapshotEdicaoRef.current = nova;
    setLinhaEditando(nova.id);
  }

  function atualizarCampoLinha(id, campo, valor) {
    setFormasPagamento((fs) => fs.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
  }

  function iniciarEdicaoLinha(entry) {
    snapshotEdicaoRef.current = entry;
    setLinhaEditando(entry.id);
  }

  function cancelarEdicaoLinha() {
    const snap = snapshotEdicaoRef.current;
    if (snap) {
      if (!snap.forma_pagamento && !snap.valor) {
        // era uma linha nova, ainda vazia — remove em vez de deixar em branco
        setFormasPagamento((fs) => fs.filter((f) => f.id !== snap.id));
      } else {
        setFormasPagamento((fs) => fs.map((f) => (f.id === snap.id ? snap : f)));
      }
    }
    setLinhaEditando(null);
    snapshotEdicaoRef.current = null;
  }

  function salvarEdicaoLinha(entry) {
    if (!entry.valor || Number(entry.valor) <= 0 || !entry.forma_pagamento) {
      alert("Preencha o valor e a forma de pagamento antes de salvar esta linha.");
      return;
    }
    setLinhaEditando(null);
    snapshotEdicaoRef.current = null;
  }

  function excluirLinha(id) {
    if (!window.confirm("Remover esta forma de pagamento?")) return;
    setFormasPagamento((fs) => fs.filter((f) => f.id !== id));
    if (linhaEditando === id) {
      setLinhaEditando(null);
      snapshotEdicaoRef.current = null;
    }
  }

  return (
    <div className="max-w-4xl relative">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Operação</p>
        <h1 className="font-display text-2xl font-semibold text-ink flex items-center gap-2">
          <ReceiptText size={22} className="text-gold" /> Novo lançamento
        </h1>
      </div>

      <form onSubmit={aoSubmeter} onKeyDown={aoTeclar} className="card p-6 grid grid-cols-3 gap-4">
        {precisaEscolherLinha && (
          <div>
            <Rotulo icone={Route}>Linha</Rotulo>
            <div className="flex gap-2">
              {[
                { valor: "ci", rotulo: "CI (balcão)" },
                { valor: "ih", rotulo: "IH (in-home)" },
              ].map((opcao) => (
                <button
                  type="button"
                  key={opcao.valor}
                  onClick={() => setLinhaOperacao(opcao.valor)}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm transition ${
                    linhaOperacao === opcao.valor
                      ? "border-gold bg-gold-soft/60 text-gold-strong font-medium"
                      : "border-line bg-white text-muted hover:border-gold/50"
                  }`}
                >
                  {opcao.rotulo}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <Rotulo icone={Store}>Unidade</Rotulo>
          {unidadeUnica ? (
            <div className="field-input bg-canvas text-ink font-medium flex items-center">{unidadesDaLinha[0]?.nome}</div>
          ) : (
            <select className="field-input" value={unidadeId} onChange={(e) => setUnidadeId(e.target.value)}>
              {unidadesDaLinha.length === 0 && <option value="">Nenhuma unidade atende essa linha</option>}
              {unidadesDaLinha.map((u) => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          )}
        </div>
        <div>
          <Rotulo icone={CalendarDays}>Data</Rotulo>
          <input
            className="field-input"
            type="date"
            value={data}
            onChange={(e) => setData(e.target.value)}
            disabled={!dataEditavel}
            max={hoje()}
            required
          />
        </div>
        <div>
          <Rotulo icone={Hash}>Nº da OS (10 caracteres)</Rotulo>
          <input
            className="field-input font-mono-num"
            value={numeroOsDigitado}
            maxLength={10}
            onChange={(e) => { setNumeroOsDigitado(e.target.value.toUpperCase()); setErroOs(null); }}
            onBlur={aoSairCampoOS}
            placeholder="Ex: O-00000015"
            required
          />
          {erroOs && <p className="text-xs text-danger mt-1">{erroOs}</p>}
        </div>

        <div>
          <Rotulo icone={Tags}>Categoria</Rotulo>
          <select className="field-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} required>
            <option value="">Selecione</option>
            {categoriasVisiveis.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </select>
        </div>
        <div>
          <Rotulo icone={Boxes}>Modelo</Rotulo>
          <ComboBoxModelo
            categoriaId={categoriaId}
            unidadeId={unidadeId}
            modeloId={modeloId}
            onSelecionar={setModeloId}
            disabled={!categoriaId}
            categoriaIdsBusca={(() => {
              const cat = categorias.find((c) => c.id === categoriaId);
              if (!cat) return undefined;
              if (cat.categoria_pareada_id) return [cat.id, cat.categoria_pareada_id];
              if (cat.somente_ih) return null; // sem par definido: busca em todas
              return undefined; // padrão: só a própria categoria
            })()}
          />
        </div>
        <div>
          <Rotulo icone={Wrench}>Tipo de serviço</Rotulo>
          <select className="field-input" value={tipoServicoId} onChange={(e) => setTipoServicoId(e.target.value)} disabled={!categoriaId} required>
            <option value="">{categoriaId ? "Selecione" : "Escolha a categoria primeiro"}</option>
            {tiposServico.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          {categoriaId && !carregandoTipos && tiposServico.length === 0 && (
            <p className="text-xs text-danger mt-1">Nenhum tipo de serviço cadastrado para essa categoria — avise a Configurações.</p>
          )}
        </div>

        <div>
          <Rotulo icone={Wallet}>Orçamento aprovado <span className="normal-case text-muted">(opcional)</span></Rotulo>
          <CurrencyInput valor={orcamento} onChange={setOrcamento} disabled={orcamentoTravado} />
          {orcamentoTravado ? (
            <p className="text-xs text-muted mt-1">Travado nesta OS.</p>
          ) : (
            <p className="text-xs text-muted mt-1">Deixe em branco se ainda não foi definido (ex: cliente pagou só a taxa de análise).</p>
          )}
        </div>
        <div>
          <Rotulo icone={CircleDollarSign}>Valor pago agora</Rotulo>
          {usaMultiplasFormas ? (
            <>
              <CurrencyInput valor={totalFormas} disabled />
              <p className="text-xs text-muted mt-1">{formasPagamento.length} forma(s) de pagamento — veja abaixo.</p>
            </>
          ) : (
            <>
              <CurrencyInput valor={valorPago} onChange={setValorPago} />
              {saldoRestante !== null && <p className="text-xs text-muted mt-1">Saldo restante: R$ {saldoRestante.toFixed(2)}</p>}
            </>
          )}
        </div>
        <div>
          <Rotulo icone={CreditCard}>Forma de pagamento</Rotulo>
          {usaMultiplasFormas ? (
            <div className="field-input flex items-center justify-between bg-canvas">
              <span className="text-sm text-ink">Múltiplas formas</span>
              <button type="button" onClick={usarFormaUnica} className="text-xs text-muted hover:text-danger transition flex items-center gap-1">
                <X size={12} /> usar 1 forma
              </button>
            </div>
          ) : (
            <div>
              <select
                className="field-input"
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
                disabled={!(Number(valorPago) > 0)}
                required={Number(valorPago) > 0}
              >
                <option value="">{Number(valorPago) > 0 ? "Selecione" : "Nenhuma"}</option>
                {FORMAS_PAGAMENTO.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setMostrarModalFormas(true)}
                className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white
                  bg-gradient-to-b from-gold to-gold-strong shadow-sm hover:brightness-105 hover:-translate-y-px active:translate-y-0 transition-all"
              >
                <Ticket size={13} /> Dividir em mais de uma forma
              </button>
            </div>
          )}
        </div>

        {!usaMultiplasFormas && (
          <>
            <div>
              <Rotulo icone={Layers}>Parcelas</Rotulo>
              <select className="field-input" value={parcelas} onChange={(e) => setParcelas(e.target.value)} disabled={!precisaParcelasUnica}>
                <option value="">1x</option>
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <Rotulo icone={Landmark}>Bandeira</Rotulo>
              <div className="flex gap-2 flex-wrap">
                {BANDEIRAS.map((b) => (
                  <button
                    type="button"
                    key={b}
                    disabled={!precisaBandeiraUnica}
                    onClick={() => setBandeira(b)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
                      bandeira === b ? "border-gold bg-gold-soft/60 text-gold-strong font-medium" : "border-line bg-white text-muted hover:border-gold/50"
                    }`}
                  >
                    <CreditCard size={14} /> {b}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {usaMultiplasFormas && (
          <div className="col-span-3">
            <Rotulo icone={Ticket}>Formas de pagamento cadastradas</Rotulo>
            <div className="card divide-y divide-line">
              {formasPagamento.map((f) =>
                linhaEditando === f.id ? (
                  <div key={f.id} className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="w-32 shrink-0">
                        <label className="field-label">Valor</label>
                        <CurrencyInput valor={f.valor} onChange={(v) => atualizarCampoLinha(f.id, "valor", v)} />
                      </div>
                      <div className="flex-1">
                        <label className="field-label">Forma de pagamento</label>
                        <select className="field-input" value={f.forma_pagamento} onChange={(e) => atualizarCampoLinha(f.id, "forma_pagamento", e.target.value)}>
                          <option value="">Selecione</option>
                          {FORMAS_PAGAMENTO.map((fp) => (
                            <option key={fp} value={fp}>{fp}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {(precisaParcelasFn(f.forma_pagamento) || precisaBandeiraFn(f.forma_pagamento)) && (
                      <div className="flex items-end gap-2 mt-2">
                        {precisaParcelasFn(f.forma_pagamento) && (
                          <div className="w-24 shrink-0">
                            <label className="field-label">Parcelas</label>
                            <select className="field-input" value={f.parcelas || ""} onChange={(e) => atualizarCampoLinha(f.id, "parcelas", e.target.value)}>
                              <option value="">1x</option>
                              {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                <option key={n} value={n}>{n}x</option>
                              ))}
                            </select>
                          </div>
                        )}
                        {precisaBandeiraFn(f.forma_pagamento) && (
                          <div className="flex-1">
                            <label className="field-label">Bandeira</label>
                            <div className="flex gap-1.5 flex-wrap">
                              {BANDEIRAS.map((b) => (
                                <button
                                  type="button"
                                  key={b}
                                  onClick={() => atualizarCampoLinha(f.id, "bandeira", b)}
                                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                                    f.bandeira === b ? "border-gold bg-gold-soft/60 text-gold-strong font-medium" : "border-line bg-white text-muted hover:border-gold/50"
                                  }`}
                                >
                                  <CreditCard size={12} /> {b}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-2 mt-3">
                      <button type="button" className="btn text-xs" onClick={cancelarEdicaoLinha}>Cancelar</button>
                      <button type="button" className="btn-primary text-xs" onClick={() => salvarEdicaoLinha(f)}>Salvar</button>
                    </div>
                  </div>
                ) : (
                  <div key={f.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-medium">R$ {Number(f.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      <span className="text-xs text-muted bg-canvas px-2 py-0.5 rounded">{f.forma_pagamento}</span>
                      {f.parcelas && <span className="text-xs text-muted">{f.parcelas}x</span>}
                      {f.bandeira && <span className="text-xs text-muted">{f.bandeira}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button type="button" title="Alterar" onClick={() => iniciarEdicaoLinha(f)} className="text-muted hover:text-gold transition p-1">
                        <Pencil size={14} />
                      </button>
                      <button type="button" title="Excluir" onClick={() => excluirLinha(f.id)} className="text-muted hover:text-danger transition p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
            <button type="button" onClick={adicionarLinhaInline} className="btn text-xs flex items-center gap-1.5 mt-2">
              <Plus size={13} /> Adicionar outra forma de pagamento
            </button>
          </div>
        )}

        <div className="col-span-3">
          <Rotulo icone={StickyNote}>Observações <span className="normal-case text-muted">(opcional)</span></Rotulo>
          <textarea
            className="field-input min-h-[72px] resize-y"
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Alguma informação adicional sobre esse lançamento, se necessário…"
          />
        </div>

        {mensagem && (
          <div className={`col-span-3 text-sm rounded-lg px-3 py-2.5 ${mensagem.tipo === "erro" ? "bg-danger-soft text-danger" : "bg-teal-soft text-teal"}`}>
            {mensagem.texto}
          </div>
        )}

        <div className="col-span-3 flex justify-end">
          <button type="submit" disabled={salvando} className="btn-primary flex items-center gap-2">
            <Save size={16} />
            {salvando ? "Salvando…" : "Salvar lançamento"}
          </button>
        </div>
      </form>

      <FormasPagamentoModal
        aberto={mostrarModalFormas}
        formasIniciais={[]}
        onFechar={() => setMostrarModalFormas(false)}
        onSalvar={aoSalvarModalFormas}
      />
    </div>
  );
}

export default function LancamentoPage() {
  return (
    <AppShell>
      <FormularioLancamento />
    </AppShell>
  );
}
