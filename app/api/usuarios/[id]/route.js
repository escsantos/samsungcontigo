import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function DELETE(req, { params }) {
  const gestor = await verificarGestor(req);
  if (!gestor) {
    return NextResponse.json({ erro: "Você não tem permissão para excluir usuários." }, { status: 403 });
  }
  if (gestor.id === params.id) {
    return NextResponse.json({ erro: "Você não pode excluir o seu próprio usuário." }, { status: 400 });
  }
  const { error } = await supabaseAdmin.auth.admin.deleteUser(params.id);
  if (error) {
    return NextResponse.json({ erro: "Falha ao excluir: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
