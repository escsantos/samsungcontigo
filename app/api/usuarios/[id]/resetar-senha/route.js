import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SENHA_INICIAL } from "../../../../../lib/usuarios";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verificarGestor(req) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace("Bearer ", "");
  if (!token) return null;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: perfil } = await supabaseAdmin.from("perfis").select("*").eq("id", user.id).single();
  if (!perfil || !["Administrador", "Diretor", "Gerente", "Supervisor"].includes(perfil.cargo)) return null;
  return perfil;
}

export async function POST(req, { params }) {
  const gestor = await verificarGestor(req);
  if (!gestor) {
    return NextResponse.json({ erro: "Você não tem permissão para resetar senhas." }, { status: 403 });
  }

  const { data: perfilAlvo } = await supabaseAdmin.from("perfis").select("login").eq("id", params.id).single();
  if (!perfilAlvo) {
    return NextResponse.json({ erro: "Usuário não encontrado." }, { status: 404 });
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(params.id, { password: SENHA_INICIAL });
  if (error) {
    return NextResponse.json({ erro: "Falha ao resetar senha: " + error.message }, { status: 500 });
  }

  await supabaseAdmin.from("perfis").update({ senha_temporaria: true }).eq("id", params.id);

  return NextResponse.json({
    login: perfilAlvo.login,
    senha: SENHA_INICIAL,
    email: `${perfilAlvo.login}@pecas.jmacedo.internal`
  });
}
