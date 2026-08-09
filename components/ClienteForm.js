"use client";
import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import {
  validarCPF, validarCNPJ, formatarCPF, formatarCNPJ, formatarTelefone, formatarCEP,
  buscarCEP, apenasNumeros, ESTADOS_BR, CATEGORIAS_CLIENTE, CONDICOES_PAGAMENTO, ORIGENS_CLIENTE
} from "../lib/clientes";

const VAZIO = {
  tipo_pessoa: "fisica",
  nome: "",
  nome_fantasia: "",
  cpf: "",
  rg: "",
  data_nascimento: "",
  cnpj: "",
  inscricao_estadual: "",
  ie_isento: false,
  inscricao_municipal: "",
  contato_responsavel: "",
  email: "",
  email_secundario: "",
  telefone_fixo: "",
  celular: "",
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  estado: "",
  referencia: "",
  vendedor_id: "",
  categoria: "",
  condicao_pagamento: "",
  status: "Ativo",
  observacoes: "",
  origem: ""
};

export default function ClienteForm({ inicial, vendedores, onSalvar, salvando, erro }) {
  const [dados, setDados] = useState({ ...VAZIO, ...inicial });
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroDoc, setErroDoc] = useState("");

  useEffect(() => {
    if (inicial) setDados({ ...VAZIO, ...inicial });
  }, [inicial]);

  function set(campo, valor) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  async function aoSairDoCep() {
    if (apenasNumeros(dados.cep).length !== 8) return;
    setBuscandoCep(true);
    const endereco = await buscarCEP(dados.cep);
    setBuscandoCep(false);
    if (endereco) {
      setDados((d) => ({ ...d, ...endereco }));
    }
  }

  function validar() {
    setErroDoc("");
    if (!dados.nome.trim()) return "Preencha o nome/razão social.";
    if (dados.tipo_pessoa === "fisica" && dados.cpf && !validarCPF(dados.cpf)) {
      setErroDoc("CPF inválido.");
      return "CPF inválido.";
    }
    if (dados.tipo_pessoa === "juridica" && dados.cnpj && !validarCNPJ(dados.cnpj)) {
      setErroDoc("CNPJ inválido.");
      return "CNPJ inválido.";
    }
    return null;
  }

  function salvar() {
    const msg = validar();
    if (msg) return;
    onSalvar(dados);
  }

  return (
    <div className="space-y-4">
      <div className="card p-6">
        <p className="font-display font-semibold text-[15px] mb-4">Tipo de cliente</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set("tipo_pessoa", "fisica")}
            className={`chip ${dados.tipo_pessoa === "fisica" ? "chip-active" : ""}`}
          >
            Pessoa Física
          </button>
          <button
            type="button"
            onClick={() => set("tipo_pessoa", "juridica")}
            className={`chip ${dados.tipo_pessoa === "juridica" ? "chip-active" : ""}`}
          >
            Pessoa Jurídica
          </button>
        </div>
      </div>

      {dados.tipo_pessoa === "fisica" ? (
        <div className="card p-6">
          <p className="font-display font-semibold text-[15px] mb-4">Identificação</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="field-label">Nome completo *</label>
              <input className="field-input" value={dados.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div>
              <label className="field-label">CPF</label>
              <input className="field-input" value={dados.cpf} onChange={(e) => set("cpf", formatarCPF(e.target.value))} placeholder="000.000.000-00" />
            </div>
            <div>
              <label className="field-label">RG</label>
              <input className="field-input" value={dados.rg} onChange={(e) => set("rg", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Data de nascimento</label>
              <input type="date" className="field-input" value={dados.data_nascimento || ""} onChange={(e) => set("data_nascimento", e.target.value)} />
            </div>
          </div>
        </div>
      ) : (
        <div className="card p-6">
          <p className="font-display font-semibold text-[15px] mb-4">Identificação</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Razão Social *</label>
              <input className="field-input" value={dados.nome} onChange={(e) => set("nome", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Nome Fantasia</label>
              <input className="field-input" value={dados.nome_fantasia} onChange={(e) => set("nome_fantasia", e.target.value)} />
            </div>
            <div>
              <label className="field-label">CNPJ</label>
              <input className="field-input" value={dados.cnpj} onChange={(e) => set("cnpj", formatarCNPJ(e.target.value))} placeholder="00.000.000/0000-00" />
            </div>
            <div>
              <label className="field-label">Contato responsável</label>
              <input className="field-input" value={dados.contato_responsavel} onChange={(e) => set("contato_responsavel", e.target.value)} />
            </div>
            <div>
              <label className="field-label">Inscrição Estadual</label>
              <input
                className="field-input"
                value={dados.inscricao_estadual}
                disabled={dados.ie_isento}
                onChange={(e) => set("inscricao_estadual", e.target.value)}
              />
              <label className="flex items-center gap-1.5 mt-1.5 text-xs text-muted">
                <input type="checkbox" checked={dados.ie_isento} onChange={(e) => set("ie_isento", e.target.checked)} />
                Isento / Não contribuinte
              </label>
            </div>
            <div>
              <label className="field-label">Inscrição Municipal</label>
              <input className="field-input" value={dados.inscricao_municipal} onChange={(e) => set("inscricao_municipal", e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {erroDoc && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erroDoc}</div>}

      <div className="card p-6">
        <p className="font-display font-semibold text-[15px] mb-4">Contato</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">E-mail</label>
            <input type="email" className="field-input" value={dados.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <label className="field-label">E-mail secundário</label>
            <input type="email" className="field-input" value={dados.email_secundario} onChange={(e) => set("email_secundario", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Telefone fixo</label>
            <input className="field-input" value={dados.telefone_fixo} onChange={(e) => set("telefone_fixo", formatarTelefone(e.target.value))} placeholder="(00) 0000-0000" />
          </div>
          <div>
            <label className="field-label">Celular / WhatsApp</label>
            <input className="field-input" value={dados.celular} onChange={(e) => set("celular", formatarTelefone(e.target.value))} placeholder="(00) 00000-0000" />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <p className="font-display font-semibold text-[15px] mb-4">Endereço</p>
        <div className="grid grid-cols-3 gap-4">
          <div className="relative">
            <label className="field-label">CEP</label>
            <input
              className="field-input pr-9"
              value={dados.cep}
              onChange={(e) => set("cep", formatarCEP(e.target.value))}
              onBlur={aoSairDoCep}
              placeholder="00000-000"
            />
            <span className="absolute right-3 top-[34px]">
              {buscandoCep ? <Loader2 size={15} className="animate-spin text-muted" /> : <Search size={15} className="text-muted" />}
            </span>
          </div>
          <div className="col-span-2">
            <label className="field-label">Logradouro</label>
            <input className="field-input" value={dados.logradouro} onChange={(e) => set("logradouro", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Número</label>
            <input className="field-input" value={dados.numero} onChange={(e) => set("numero", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Complemento</label>
            <input className="field-input" value={dados.complemento} onChange={(e) => set("complemento", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Bairro</label>
            <input className="field-input" value={dados.bairro} onChange={(e) => set("bairro", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Cidade</label>
            <input className="field-input" value={dados.cidade} onChange={(e) => set("cidade", e.target.value)} />
          </div>
          <div>
            <label className="field-label">Estado</label>
            <select className="field-input" value={dados.estado} onChange={(e) => set("estado", e.target.value)}>
              <option value="">-</option>
              {ESTADOS_BR.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="col-span-3">
            <label className="field-label">Ponto de referência</label>
            <input className="field-input" value={dados.referencia} onChange={(e) => set("referencia", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card p-6">
        <p className="font-display font-semibold text-[15px] mb-4">Comercial</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Vendedor responsável</label>
            <select className="field-input" value={dados.vendedor_id || ""} onChange={(e) => set("vendedor_id", e.target.value || null)}>
              <option value="">-</option>
              {(vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Categoria</label>
            <select className="field-input" value={dados.categoria || ""} onChange={(e) => set("categoria", e.target.value)}>
              <option value="">-</option>
              {CATEGORIAS_CLIENTE.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Condição de pagamento</label>
            <select className="field-input" value={dados.condicao_pagamento || ""} onChange={(e) => set("condicao_pagamento", e.target.value)}>
              <option value="">-</option>
              {CONDICOES_PAGAMENTO.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Origem do cliente</label>
            <select className="field-input" value={dados.origem || ""} onChange={(e) => set("origem", e.target.value)}>
              <option value="">-</option>
              {ORIGENS_CLIENTE.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="card p-6">
        <p className="font-display font-semibold text-[15px] mb-4">Controle</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="field-label">Status</label>
            <select className="field-input" value={dados.status} onChange={(e) => set("status", e.target.value)}>
              <option value="Ativo">Ativo</option>
              <option value="Inativo">Inativo</option>
              <option value="Bloqueado">Bloqueado</option>
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="field-label">Observações</label>
          <textarea className="field-input" rows={3} value={dados.observacoes} onChange={(e) => set("observacoes", e.target.value)} />
        </div>
      </div>

      {erro && <div className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2">{erro}</div>}

      <button className="btn-primary" onClick={salvar} disabled={salvando}>
        {salvando ? "Salvando..." : "Salvar cliente"}
      </button>
    </div>
  );
}
