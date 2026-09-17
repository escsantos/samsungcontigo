import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { gerarLogin } from "../../../lib/textoUtil";

const CARGOS_PODEM_EDITAR = ["administrador", "diretor", "supervisao", "gerencia"];

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
    if (!chamador || !CARGOS_PODEM_EDITAR.includes(chamador.cargo)) {
      return NextResponse.json({ erro: "Sem permissão para editar usuários." }, { status: 403 });
    }

    const { usuarioId, nome, sobrenome, cargo, unidadeIds, linha } = await request.json();

    if (["supervisao", "gerencia"].includes(chamador.cargo)) {
      if (["administrador", "diretor", "adm"].includes(cargo)) {
        return NextResponse.json({ erro: "Você não pode atribuir esse cargo." }, { status: 403 });
      }
      const { data: minhasUnidades } = await admin.from("usuario_unidades").select("unidade_id").eq("usuario_id", chamador.id);
      const idsPermitidos = new Set((minhasUnidades || []).map((u) => u.unidade_id));

      const { data: unidadesDoAlvo } = await admin.from("usuario_unidades").select("unidade_id").eq("usuario_id", usuarioId);
      const alvoNoEscopo = (unidadesDoAlvo || []).some((u) => idsPermitidos.has(u.unidade_id));
      if (!alvoNoEscopo) {
        return NextResponse.json({ erro: "Esse usuário não é de uma unidade que você administra." }, { status: 403 });
      }

      const foraDoEscopo = (unidadeIds || []).some((id) => !idsPermitidos.has(id));
      if (foraDoEscopo || !unidadeIds?.length) {
        return NextResponse.json({ erro: "Você só pode atribuir unidades que você mesmo tem acesso." }, { status: 403 });
      }
    }

    const login = gerarLogin(nome, sobrenome);
    const email = `${login}@jmacedo.internal`;

    const { error: erroAuth } = await admin.auth.admin.updateUserById(usuarioId, { email });
    if (erroAuth) return NextResponse.json({ erro: erroAuth.message }, { status: 400 });

    const { error: erroPerfil } = await admin
      .from("usuarios")
      .update({ nome_completo: `${nome} ${sobrenome}`.toUpperCase(), login, cargo, linha: linha || null })
      .eq("id", usuarioId);
    if (erroPerfil) return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });

    await admin.from("usuario_unidades").delete().eq("usuario_id", usuarioId);
    if (unidadeIds?.length) {
      await admin.from("usuario_unidades").insert(unidadeIds.map((unidade_id) => ({ usuario_id: usuarioId, unidade_id })));
    }

    return NextResponse.json({ login });
  } catch (err) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
