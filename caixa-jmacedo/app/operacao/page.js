"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import AppShell, { NAV_OPERACAO } from "../../components/AppShell";

function Conteudo() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted mb-1">Menu</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Operação</h1>
        <p className="text-sm text-muted mt-1">Escolha o que você quer fazer.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {NAV_OPERACAO.map((item) => {
          const Icone = item.icon;
          return (
            <Link key={item.href} href={item.href} className="card p-5 hover:border-gold/50 transition group">
              <div className="w-10 h-10 rounded-lg bg-gold-soft flex items-center justify-center text-gold-strong mb-3">
                <Icone size={18} />
              </div>
              <p className="font-display text-base font-semibold text-ink mb-1 flex items-center gap-1.5">
                {item.label}
                <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition -translate-x-1 group-hover:translate-x-0" />
              </p>
              <p className="text-sm text-muted">{item.descricao}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function OperacaoHub() {
  return (
    <AppShell>
      <Conteudo />
    </AppShell>
  );
}
