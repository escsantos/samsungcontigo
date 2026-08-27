"use client";

/**
 * Logo do Grupo J.Macedo, recriado em SVG (fundo transparente).
 * variant="claro"  -> para fundos escuros (sidebar, painel de TV escuro): traços em branco/dourado
 * variant="escuro" -> para fundos claros (login, painel de TV claro): traços em azul/cinza (cores originais)
 */
export default function LogoJMacedo({ variant = "escuro", className = "" }) {
  const claro = variant === "claro";
  const corHook = claro ? "#E8E9EC" : "#5B6472";
  const corDiamante = claro ? "#D9A63E" : "#2E5AA8";
  const corJ = claro ? "#FFFFFF" : "#1B2430";
  const corMacedo = claro ? "#D9A63E" : "#2E5AA8";
  const corSub = claro ? "#C9CBD1" : "#4A4F58";

  return (
    <svg
      viewBox="0 0 320 90"
      className={className}
      role="img"
      aria-label="Grupo J.Macedo Eletrônica"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* gancho/onda estilizado */}
      <path
        d="M18 30 L34 46 L50 28"
        stroke={corHook}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M18 30 C10 40, 12 56, 24 60 C34 63, 44 58, 48 48"
        stroke={corHook}
        strokeWidth="7"
        strokeLinecap="round"
        fill="none"
      />
      {/* diamante */}
      <rect x="34" y="6" width="11" height="11" rx="1.5" transform="rotate(45 39.5 11.5)" fill={corDiamante} />

      {/* wordmark */}
      <text x="66" y="20" fontFamily="var(--font-display), sans-serif" fontSize="10" fontWeight="600" letterSpacing="1.5" fill={corSub}>
        GRUPO
      </text>
      <text x="66" y="46" fontFamily="var(--font-display), sans-serif" fontSize="30" fontWeight="700" fill={corJ}>
        J.
        <tspan fill={corMacedo}>macedo</tspan>
      </text>
      <line x1="67" y1="56" x2="230" y2="56" stroke={corMacedo} strokeWidth="1.5" opacity="0.6" />
      <text x="67" y="72" fontFamily="var(--font-body), sans-serif" fontSize="11" fontWeight="600" letterSpacing="3" fill={corSub}>
        ELETRÔNICA
      </text>
    </svg>
  );
}
