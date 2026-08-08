"use client";
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import Modal from "./Modal";

export default function CredenciaisModal({ dados, onClose }) {
  const [copiado, setCopiado] = useState(false);

  if (!dados) return null;

  const link = typeof window !== "undefined" ? `${window.location.origin}/login` : "";
  const texto = `Acesso ao sistema Consulta de Peças — Grupo J.Macedo\nLink: ${link}\nLogin: ${dados.login}\nSenha: ${dados.senha}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) {
      // ignora silenciosamente se o navegador bloquear a área de transferência
    }
  }

  return (
    <Modal
      open={!!dados}
      onClose={onClose}
      title="Credenciais de acesso"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Fechar</button>
          <button className="btn-primary" onClick={copiar}>
            {copiado ? <Check size={16} /> : <Copy size={16} />}
            {copiado ? "Copiado!" : "Copiar"}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted mb-4">
        Envie essas informações para o usuário (WhatsApp, e-mail, etc). Recomende trocar a senha no primeiro acesso.
      </p>
      <div className="bg-canvas rounded-lg p-4 font-mono text-sm space-y-1.5">
        <p><span className="text-muted">Link: </span>{link}</p>
        <p><span className="text-muted">Login: </span>{dados.login}</p>
        <p><span className="text-muted">Senha: </span>{dados.senha}</p>
      </div>
    </Modal>
  );
}
