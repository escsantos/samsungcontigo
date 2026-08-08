export function iniciaisNome(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export default function Avatar({ nome, fotoUrl, tamanho = 40, className = "" }) {
  const estilo = { width: tamanho, height: tamanho, fontSize: tamanho * 0.38 };

  if (fotoUrl) {
    return (
      <img
        src={fotoUrl}
        alt={nome || "Avatar"}
        style={estilo}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      style={{ ...estilo, background: "var(--accent)" }}
      className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${className}`}
    >
      {iniciaisNome(nome)}
    </div>
  );
}
