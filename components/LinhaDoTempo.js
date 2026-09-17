"use client";
import { FileText, Send, Clock, CheckCircle2, XCircle, Receipt, PackageCheck, PackageOpen, DollarSign, AlertTriangle, Wrench } from "lucide-react";

function fmtDataHora(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtBRL(v) {
  if (v === null || v === undefined || isNaN(v)) return "—";
  return "R$ " + Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function porNome(nome) {
  return nome ? ` — por ${nome}` : "";
}

export default function LinhaDoTempo({ orcamento, itens = [], pagamentos = [], numeroPedidoPai = null }) {
  if (!orcamento) return null;

  const eventos = [];

  eventos.push({
    icone: FileText,
    cor: "#5D6572",
    titulo: "Lançamento criado" + porNome(orcamento.criador?.nome),
    data: orcamento.criado_em
  });

  if (orcamento.revisado_em) {
    if (orcamento.status === "Rejeitado") {
      eventos.push({
        icone: XCircle,
        cor: "#E1614F",
        titulo: "Pedido rejeitado" + porNome(orcamento.revisor?.nome) + (orcamento.motivo_rejeicao ? ` — Motivo: ${orcamento.motivo_rejeicao}` : ""),
        data: orcamento.revisado_em
      });
    } else {
      eventos.push({
        icone: Send,
        cor: "#2E6DA8",
        titulo: "Enviado para separação/compra" + porNome(orcamento.revisor?.nome),
        data: orcamento.revisado_em
      });
    }
  }

  pagamentos.forEach((p) => {
    eventos.push({
      icone: DollarSign,
      cor: "#2C7C6E",
      titulo: `Pagamento registrado — ${p.forma_pagamento}: ${fmtBRL(p.valor)}` + porNome(p.registrador?.nome),
      data: p.registrado_em
    });
  });

  if (orcamento.valor_herdado_pai > 0 && orcamento.pedido_pai_id) {
    eventos.push({
      icone: DollarSign,
      cor: "#7A4FB0",
      titulo: `${fmtBRL(orcamento.valor_herdado_pai)} herdado do pedido #${numeroPedidoPai ?? orcamento.pedido_pai_id}`,
      data: orcamento.criado_em
    });
  }

  if (orcamento.os_interna && orcamento.os_interna_em) {
    eventos.push({
      icone: Wrench,
      cor: "#5D6572",
      titulo: `OS Interna registrada: ${orcamento.os_interna}` + porNome(orcamento.informanteOS?.nome),
      data: orcamento.os_interna_em
    });
  }

  if (orcamento.recebimento_confirmado_em) {
    eventos.push({
      icone: CheckCircle2,
      cor: "#2C7C6E",
      titulo: "Recebimento confirmado pelo Financeiro" + porNome(orcamento.recebedor?.nome),
      data: orcamento.recebimento_confirmado_em
    });
  }

  if (itens.length > 0 && itens.every((i) => i.liberado)) {
    const ultimaLiberacao = itens.reduce((max, i) => (i.liberado_em && (!max || i.liberado_em > max) ? i.liberado_em : max), null);
    if (ultimaLiberacao) {
      const itemDaUltimaLiberacao = itens.find((i) => i.liberado_em === ultimaLiberacao);
      eventos.push({
        icone: PackageCheck,
        cor: "#9C5A34",
        titulo: "Todas as peças liberadas (Delivery confirmada)" + porNome(itemDaUltimaLiberacao?.liberador?.nome),
        data: ultimaLiberacao
      });
    }
  }

  if (orcamento.pagamento_validado_em) {
    eventos.push({
      icone: Receipt,
      cor: "#4338CA",
      titulo: "Faturamento efetuado" + porNome(orcamento.validador?.nome),
      data: orcamento.pagamento_validado_em
    });
  }

  if (orcamento.liberado_sem_pagamento_em) {
    eventos.push({
      icone: AlertTriangle,
      cor: "#C2410C",
      titulo: `Liberado para faturamento SEM pagamento total` + porNome(orcamento.liberador?.nome) +
        (orcamento.liberado_sem_pagamento_motivo ? ` — Motivo: ${orcamento.liberado_sem_pagamento_motivo}` : ""),
      data: orcamento.liberado_sem_pagamento_em
    });
  }

  if (orcamento.separado_em) {
    eventos.push({
      icone: PackageOpen,
      cor: "#2E7F97",
      titulo: "Peças separadas para entrega" + porNome(orcamento.separador?.nome),
      data: orcamento.separado_em
    });
  }

  if (orcamento.entregue_em) {
    eventos.push({
      icone: CheckCircle2,
      cor: "#2C7C6E",
      titulo: "Pedido entregue ao cliente" + porNome(orcamento.entregador?.nome),
      data: orcamento.entregue_em
    });
  }

  eventos.push({
    icone: Clock,
    cor: "#C2801F",
    titulo: `Status atual: ${orcamento.status}`,
    data: null,
    atual: true
  });

  const ordenados = eventos
    .filter((e) => e.data || e.atual)
    .sort((a, b) => {
      if (a.atual) return 1;
      if (b.atual) return -1;
      return new Date(a.data) - new Date(b.data);
    });

  return (
    <div className="card p-6">
      <p className="text-[10.5px] font-mono font-bold tracking-wide text-muted uppercase mb-1">Rastreabilidade</p>
      <p className="font-display font-semibold text-[15px] mb-4">Linha do tempo</p>
      <div className="space-y-0">
        {ordenados.map((ev, i) => {
          const Icone = ev.icone;
          return (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: `${ev.cor}22`, color: ev.cor }}
                >
                  <Icone size={15} />
                </div>
                {i < ordenados.length - 1 && <div className="w-px flex-1 bg-line my-1" style={{ minHeight: 24 }} />}
              </div>
              <div className={i < ordenados.length - 1 ? "pb-5" : ""}>
                <p className="text-sm font-medium">{ev.titulo}</p>
                {ev.data && <p className="text-xs text-muted mt-0.5">{fmtDataHora(ev.data)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
