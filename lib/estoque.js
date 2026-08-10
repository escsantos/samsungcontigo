import { FileSearch, UserCheck, PackageSearch, Truck, PackageCheck, Receipt, PackageOpen } from "lucide-react";

export const ORDEM_STATUS = [
  "Pendente de Análise",
  "Validado pelo Vendedor",
  "Aguardando Separação/Compra",
  "Peças Compradas - Aguardando Chegada",
  "Em Estoque - Aguardando Faturamento",
  "Faturamento Efetuado",
  "Liberado para Retirada/Entrega"
];

export const ICONES_STATUS = {
  "Pendente de Análise": FileSearch,
  "Validado pelo Vendedor": UserCheck,
  "Aguardando Separação/Compra": PackageSearch,
  "Peças Compradas - Aguardando Chegada": Truck,
  "Em Estoque - Aguardando Faturamento": PackageCheck,
  "Faturamento Efetuado": Receipt,
  "Liberado para Retirada/Entrega": PackageOpen
};

export const CORES_STATUS = {
  "Pendente de Análise": { bg: "rgba(232,163,61,0.14)", fg: "#C2801F" },
  "Validado pelo Vendedor": { bg: "rgba(74,144,217,0.14)", fg: "#2E6DA8" },
  "Rejeitado": { bg: "var(--danger-soft)", fg: "var(--danger)" },
  "Aguardando Separação/Compra": { bg: "rgba(176,132,232,0.14)", fg: "#7A4FB0" },
  "Peças Compradas - Aguardando Chegada": { bg: "rgba(88,183,214,0.14)", fg: "#2E7F97" },
  "Em Estoque - Aguardando Faturamento": { bg: "rgba(201,123,74,0.14)", fg: "#9C5A34" },
  "Faturamento Efetuado": { bg: "rgba(99,102,241,0.14)", fg: "#4338CA" },
  "Liberado para Retirada/Entrega": { bg: "rgba(63,167,150,0.14)", fg: "#2C7C6E" }
};

export function proximoStatus(atual) {
  const i = ORDEM_STATUS.indexOf(atual);
  if (i === -1 || i === ORDEM_STATUS.length - 1) return null;
  return ORDEM_STATUS[i + 1];
}

// a partir daqui a etapa exige que todo item tenha delivery/custo confirmado
export const STATUS_EXIGE_ENTREGA_PARA_AVANCAR = "Peças Compradas - Aguardando Chegada";
