import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const SENHA_PADRAO = "jmacedo001";
const CARGOS_PODEM_RESETAR = ["supervisao", "gerencia", "administrador", "diretor"];

async function usuarioAutenticado(request, admin) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: perfil } = await admin.from("usuarios").select("*").eq("id", data.user.id).single();
  return perfil;
}

export async function POST(request) {
  try {
    const admin = supabaseAdmin();
    const chamador = await usuarioAutenticado(request, admin);
    if (!chamador || !CARGOS_PODEM_RESETAR.includes(chamador.cargo)) {
      return NextResponse.json({ erro: "Sem permissão para redefinir senhas." }, { status: 403 });
    }

    const { usuarioId } = await request.json();
    const { error } = await admin.auth.admin.updateUserById(usuarioId, {
      password: SENHA_PADRAO,
      user_metadata: { requer_troca_senha: true },
    });
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

    return NextResponse.json({ senhaInicial: SENHA_PADRAO });
  } catch (err) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
