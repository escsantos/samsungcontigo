"use client";
import { Layers, Rows3, Store, Home } from "lucide-react";
import { useSessao } from "../lib/SessaoContext";

const OPCOES = [
  { valor: "todos", rotulo: "CI + IH", icone: Layers },
  { valor: "todos-detalhado", rotulo: "Detalhado", icone: Rows3 },
  { valor: "ci", rotulo: "CI", icone: Store },
  { valor: "ih", rotulo: "IH", icone: Home },
];

/**
 * Seletor de linha de operação, visível só para gestão com acesso a
 * mais de uma unidade, sendo pelo menos uma delas IH.
 *
 * CI + IH   → tudo junto, somado numa linha só por unidade.
 * Detalhado → tudo junto, mas CI e IH aparecem em linhas separadas
 *             (a mesma unidade pode aparecer 2x na tabela).
 * CI        → só atendimento de balcão.
 * IH        → só atendimento in-home.
 */
export default function BotaoLinhaToggle() {
  const { podeAlternarLinha, modoLinha, definirModoLinha } = useSessao();

  if (!podeAlternarLinha) return null;

  return (
    <div className="inline-flex items-center rounded-full border border-line bg-white p-0.5 shadow-sm">
      {OPCOES.map((op) => {
        const ativo = modoLinha === op.valor;
        const Icone = op.icone;
        return (
          <button
            key={op.valor}
            onClick={() => definirModoLinha(op.valor)}
            title={op.rotulo}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150
              ${ativo
                ? "bg-gradient-to-b from-teal to-[#0A4440] text-white shadow-[0_2px_0_0_rgba(0,0,0,0.18),0_4px_10px_-2px_rgba(14,90,86,0.55)]"
                : "text-muted hover:text-teal"
              }`}
          >
            <Icone size={13} />
            {op.rotulo}
          </button>
        );
      })}
    </div>
  );
}
