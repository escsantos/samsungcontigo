import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdmin";
import { gerarLogin } from "../../../lib/textoUtil";

const SENHA_PADRAO = "jmacedo001";

async function usuarioAutenticado(request, admin) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: perfil } = await admin.from("usuarios").select("*").eq("id", data.user.id).single();
  return perfil;
}

const CARGOS_PODEM_CRIAR = ["supervisao", "gerencia", "administrador", "diretor"];

export async function POST(request) {
  try {
    const admin = supabaseAdmin();
    const chamador = await usuarioAutenticado(request, admin);
    if (!chamador || !CARGOS_PODEM_CRIAR.includes(chamador.cargo)) {
      return NextResponse.json({ erro: "Sem permissão para criar usuários." }, { status: 403 });
    }

    const { nome, sobrenome, cargo, unidadeIds, linha } = await request.json();

    if (["supervisao", "gerencia"].includes(chamador.cargo)) {
      if (["administrador", "diretor", "adm"].includes(cargo)) {
        return NextResponse.json({ erro: "Você não pode criar um usuário com esse cargo." }, { status: 403 });
      }
      const { data: minhasUnidades } = await admin.from("usuario_unidades").select("unidade_id").eq("usuario_id", chamador.id);
      const idsPermitidos = new Set((minhasUnidades || []).map((u) => u.unidade_id));
      const foraDoEscopo = (unidadeIds || []).some((id) => !idsPermitidos.has(id));
      if (foraDoEscopo || !unidadeIds?.length) {
        return NextResponse.json({ erro: "Você só pode atribuir unidades que você mesmo tem acesso." }, { status: 403 });
      }
    }

    const login = gerarLogin(nome, sobrenome);
    const email = `${login}@jmacedo.internal`;

    const { data: novoUsuario, error: erroAuth } = await admin.auth.admin.createUser({
      email,
      password: SENHA_PADRAO,
      email_confirm: true,
      user_metadata: { requer_troca_senha: true },
    });
    if (erroAuth) return NextResponse.json({ erro: erroAuth.message }, { status: 400 });

    const { error: erroPerfil } = await admin.from("usuarios").insert({
      id: novoUsuario.user.id,
      nome_completo: `${nome} ${sobrenome}`.toUpperCase(),
      login,
      cargo,
      linha: linha || null,
    });
    if (erroPerfil) return NextResponse.json({ erro: erroPerfil.message }, { status: 400 });

    if (unidadeIds?.length) {
      await admin.from("usuario_unidades").insert(unidadeIds.map((unidade_id) => ({ usuario_id: novoUsuario.user.id, unidade_id })));
    }

    return NextResponse.json({ login, senhaInicial: SENHA_PADRAO });
  } catch (err) {
    return NextResponse.json({ erro: err.message }, { status: 500 });
  }
}
