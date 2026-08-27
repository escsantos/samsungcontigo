import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";

const CARGOS_PODEM_BLOQUEAR = ["gerencia", "administrador", "diretor"];

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
    if (!chamador || !CARGOS_PODEM_BLOQUEAR.includes(chamador.cargo)) {
      return NextResponse.json({ erro: "Sem permissão para bloquear/desbloquear usuários." }, { status: 403 });
    }

    const { usuarioId, bloquear } = await request.json();

    if (chamador.cargo === "gerencia") {
      const { data: minhasUnidades } = await admin.from("usuario_unidades").select("unidade_id").eq("usuario_id", chamador.id);
      const idsPermitidos = new Set((minhasUnidades || []).map((u) => u.unidade_id));
      const { data: unidadesDoAlvo } = await admin.from("usuario_unidades").select("unidade_id").eq("usuario_id", usuarioId);
      const alvoNoEscopo = (unidadesDoAlvo || []).some((u) => idsPermitidos.has(u.unidade_id));
      if (!alvoNoEscopo) {
        return NextResponse.json({ erro: "Esse usuário não é de uma unidade que você administra." }, { status: 403 });
      }
    }

    const { error: erroAuth } = await admin.auth.admin.updateUserById(usuarioId, {
      ban_duration: bloquear ? "876000h" : "none",
    });
    if (erroAuth) return NextResponse.json({ erro: erroAuth.message }, { status: 400 });

    const { error: erroPerfil } = await admin.from("usuarios").update({ ativo: !bloquear }).eq("id", usuarioId);
    if (erroPerfil) return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
