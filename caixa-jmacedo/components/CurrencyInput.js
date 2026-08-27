"use client";
import { centavosParaNumero, formatarMoedaSemSimbolo } from "../lib/formato";

/**
 * Input de valor monetário. `valor` é sempre um número (reais), e o campo
 * mostra formatado como 1.234,56 com o prefixo R$ fixo à esquerda.
 */
export default function CurrencyInput({ valor, onChange, disabled, placeholder = "0,00", className = "", required }) {
  const exibicao = valor === "" || valor === null || valor === undefined ? "" : formatarMoedaSemSimbolo(valor);

  function aoDigitar(e) {
    const numero = centavosParaNumero(e.target.value);
    onChange(numero === 0 && e.target.value.replace(/\D/g, "") === "" ? "" : numero);
  }

  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">R$</span>
      <input
        className="field-input pl-9 text-right font-mono-num"
        inputMode="numeric"
        value={exibicao}
        onChange={aoDigitar}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
