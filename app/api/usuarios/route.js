import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizarLogin, SENHA_INICIAL, CARGOS } from "../../../lib/usuarios";

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
  if (!perfil || !["Administrador", "Diretor", "Gerente"].includes(perfil.cargo)) return null;
  return perfil;
}

export async function POST(req) {
  const gestor = await verificarGestor(req);
  if (!gestor) {
    return NextResponse.json({ erro: "Você não tem permissão para criar usuários." }, { status: 403 });
  }

  const { nome, sobrenome, cargo, clienteId, nomeCompleto } = await req.json();
  if (!nome?.trim() || !sobrenome?.trim() || !cargo) {
    return NextResponse.json({ erro: "Preencha nome, sobrenome e cargo." }, { status: 400 });
  }
  if (!CARGOS.includes(cargo)) {
    return NextResponse.json({ erro: "Cargo inválido." }, { status: 400 });
  }

  const loginBase = normalizarLogin(nome, sobrenome);
  if (!loginBase || loginBase === ".") {
    return NextResponse.json({ erro: "Nome ou sobrenome inválido." }, { status: 400 });
  }

  // resolve colisão de login (ex: joao.macedo, joao.macedo2, ...)
  let loginFinal = loginBase;
  let sufixo = 2;
  while (true) {
    const { data: existente } = await supabaseAdmin
      .from("perfis")
      .select("id")
      .eq("login", loginFinal)
      .maybeSingle();
    if (!existente) break;
    loginFinal = `${loginBase}${sufixo}`;
    sufixo++;
  }

  const email = `${loginFinal}@pecas.jmacedo.internal`;

  const { data: novoUser, error: errAuth } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: SENHA_INICIAL,
    email_confirm: true
  });
  if (errAuth) {
    return NextResponse.json({ erro: "Falha ao criar login: " + errAuth.message }, { status: 500 });
  }

  const { error: errPerfil } = await supabaseAdmin.from("perfis").insert({
    id: novoUser.user.id,
    login: loginFinal,
    nome: nomeCompleto?.trim() || `${nome.trim()} ${sobrenome.trim()}`,
    cargo,
    cliente_id: clienteId || null
  });
  if (errPerfil) {
    await supabaseAdmin.auth.admin.deleteUser(novoUser.user.id);
    return NextResponse.json({ erro: "Falha ao salvar perfil: " + errPerfil.message }, { status: 500 });
  }

  return NextResponse.json({ id: novoUser.user.id, login: loginFinal, senha: SENHA_INICIAL, email });
}
