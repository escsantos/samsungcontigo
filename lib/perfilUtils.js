export function redimensionarImagem(arquivo, tamanhoMax = 320, qualidade = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > tamanhoMax) {
        height = Math.round((height * tamanhoMax) / width);
        width = tamanhoMax;
      } else if (height > tamanhoMax) {
        width = Math.round((width * tamanhoMax) / height);
        height = tamanhoMax;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Falha ao processar imagem."))),
        "image/jpeg",
        qualidade
      );
    };
    img.onerror = () => reject(new Error("Não foi possível ler essa imagem."));
    img.src = url;
  });
}

export function calcularCompletude(perfil) {
  const campos = [
    !!perfil?.nome,
    !!perfil?.login,
    !!perfil?.cargo,
    !!perfil?.foto_url,
    !!perfil?.email,
    !!perfil?.telefone
  ];
  const preenchidos = campos.filter(Boolean).length;
  return Math.round((preenchidos / campos.length) * 100);
}

export function permissoesAtivas(cargo) {
  return [
    { label: "Consultar Peças", ativo: true },
    { label: "Ver valor de custo", ativo: cargo !== "Cliente" },
    { label: "Carregar Bases", ativo: cargo === "Administrador" },
    { label: "Gerenciar Usuários", ativo: ["Administrador", "Diretor", "Gerente", "Supervisor"].includes(cargo) }
  ];
}
