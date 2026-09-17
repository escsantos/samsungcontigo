# CAIXA — Grupo J.Macedo

Sistema de controle de caixa das 21 unidades do Grupo J.Macedo: lançamento de
ordens de serviço, orçamento x valor pago, contas a receber, dashboards por
loja/consolidado e o painel de ranking para TV (Dia / Semana / Mês, com
rotação automática a cada 20s).

## Stack

- **Next.js** (App Router) — frontend
- **Supabase** (Postgres + Auth + Row Level Security) — banco de dados, login e permissões
- **Vercel** — hospedagem da aplicação (deploy automático a cada push no GitHub)
- **GitHub** (`GRUPOJMACEDO/CAIXA`) — código-fonte

## Passo a passo para colocar no ar

### 1. Criar o projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie um projeto novo (gratuito para começar).
2. Vá em **SQL Editor** → cole e rode todo o conteúdo de `supabase/schema.sql`.
3. Depois rode `supabase/seed.sql` (cria as 21 unidades e os cadastros base de categoria/tipo de serviço).
4. Em **Project Settings → API**, copie a **Project URL** e a **anon public key**.

### 2. Criar os primeiros usuários (login)
O cadastro de usuário (tela `/cadastros/usuarios`) prepara os dados, mas a
criação do login/senha em si precisa da **service_role key** do Supabase, que
não pode rodar no navegador por segurança. O caminho mais simples pro
primeiro acesso (o Administrador):

1. No Supabase, vá em **Authentication → Users → Add user**.
2. E-mail: `nome.sobrenome@jmacedo.internal` (é assim que o login vira e-mail internamente).
3. Defina uma senha.
4. Depois, na tabela `usuarios` (Table Editor), crie uma linha com o mesmo `id`
   do usuário criado, preenchendo `nome_completo`, `login` (`nome.sobrenome`) e `cargo`.
5. Vincule a unidade em `usuario_unidades`.

Depois que o Administrador existir, o ideal é eu ligar o formulário de
`/cadastros/usuarios` a uma rota de servidor (`app/api/criar-usuario`) usando
a service_role key, para que o próprio Administrador crie os demais logins
pela tela — posso montar essa rota quando você quiser.

### 3. Rodar localmente
```bash
npm install
cp .env.example .env.local
# preencha .env.local com a URL e a anon key do seu projeto Supabase
npm run dev
```
Acesse `http://localhost:3000`.

### 4. Subir para o GitHub
O repositório `GRUPOJMACEDO/CAIXA` já existe. Publique este código nele:
```bash
git init
git remote add origin https://github.com/GRUPOJMACEDO/CAIXA.git
git add .
git commit -m "Sistema CAIXA - versão inicial"
git branch -M main
git push -u origin main
```
(Rode isso você mesmo no seu terminal — preciso que você digite suas próprias
credenciais do GitHub, eu não tenho acesso a elas.)

### 5. Deploy no Vercel
1. Acesse [vercel.com](https://vercel.com) → **New Project** → importe `GRUPOJMACEDO/CAIXA`.
2. Em **Environment Variables**, adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy. A partir daí, todo `git push` no GitHub atualiza o site sozinho.

### 6. Painel de TV
Depois do deploy, abra `https://seu-projeto.vercel.app/painel` no monitor/TV
da loja — não pede login e atualiza sozinho.

## Estrutura de telas

| Rota | Tela | Quem acessa |
|---|---|---|
| `/login` | Login (nome.sobrenome) | Todos |
| `/lancamento` | Lançar OS/pagamento | Todos os cargos |
| `/dashboard` | Dashboard do mês (própria loja ou todas, conforme cargo) | Todos |
| `/contas-a-receber` | OS com saldo em aberto | Todos |
| `/painel` | Ranking Dia/Semana/Mês, para TV | Público, sem login |
| `/cadastros/unidades` | Cadastro de lojas | Administrador/Diretor |
| `/cadastros/usuarios` | Cadastro de usuários | Administrador/Diretor |
| `/cadastros/tipos-servico` | Cadastro de tipo de serviço | Supervisão/Gerência/Administrador/Diretor |
| `/cadastros/modelos` | Cadastro de categoria e modelo | Supervisão/Gerência/Administrador/Diretor |
| `/cadastros/metas` | Meta mensal por loja | Gerência (e Administrador/Diretor) |

## Regras de negócio já implementadas no banco (schema.sql)

- Orçamento aprovado trava no valor do 1º lançamento da OS; lançamentos
  seguintes só alimentam o valor pago.
- Trigger no banco bloqueia qualquer lançamento que faça a soma pago
  ultrapassar o orçamento aprovado da OS (mesmo se alguém tentar inserir
  direto no banco, não só pela tela).
- Número da OS limitado a 8 caracteres.
- Permissões (incluir/consultar/alterar/excluir, por cargo e por unidade)
  aplicadas via Row Level Security — valem mesmo que alguém acesse o banco
  fora da tela.
- Views prontas para os dashboards: `vw_contas_a_receber`, `vw_ranking_dia`,
  `vw_ranking_semana`, `vw_ranking_mes`, `vw_painel_tv`.

## Atualização de design e dados (versão atual)

Esta versão trouxe:
- **Casca do sistema de verdade**: login + menu lateral (`components/AppShell.js`), igual em todas as telas internas — antes cada tela era isolada.
- **Identidade visual própria**: paleta ink/dourado/prata/bronze (o próprio esquema do ranking vira o fio condutor de todo o sistema, não só do painel de TV), tipografia Space Grotesk (títulos) + Inter (texto) + IBM Plex Mono (valores em R$, como um "visor" de caixa registradora).
- **Cadastro de usuários com caixas de marcação** para vincular um usuário a várias unidades (em vez do seletor múltiplo padrão do navegador).
- **Rótulos com acentuação correta** em toda a tela (ex: "Supervisão", "Gerência") — o valor técnico salvo no banco continua sem acento (`supervisao`), só o texto exibido foi corrigido, em `lib/permissions.js`.
- **Tipos de serviço atualizados** com a lista oficial que você enviou (`TIPO_DE_SERVIÇO.xlsx`), com os acentos corrigidos (ROBÔ, RELÓGIO, PELÍCULA).

### Se o seu Supabase já estava configurado (seu caso)

Rode `supabase/atualizacao_tipos_servico.sql` no SQL Editor — ele limpa os
dados de teste (inclusive o lançamento de teste que você criou) e recria
categorias/tipos de serviço com a lista oficial. Depois disso é só puxar o
código novo (`git pull` se já estiver no GitHub, ou baixar o zip de novo) e
rodar `npm install` de novo (por causa do pacote de ícones `lucide-react`).

### Sobre os mockups no Canva

Em vez de montar telas estáticas no Canva para aprovação, decidi construir a
tela real, já funcional e conectada ao seu banco — assim você testa de
verdade (clica, cadastra, navega) em vez de aprovar uma imagem. Se depois de
usar você achar que a direção visual não é a ideal, me diga o que não
agradou (cores, densidade, tom) que eu ajusto os tokens de design
(`tailwind.config.js` e `app/globals.css`) — como é tudo centralizado ali,
mudar o visual do sistema inteiro é rápido.

## Fase 2 — o que foi adicionado

- **Acompanhamento semanal**: gráfico de linha (Recharts), seleciona uma ou várias unidades, ajusta a quantidade de semanas (padrão 15), valores em formato compacto (1,5K).
- **Aparência**: botão no rodapé do menu — 8 temas de cor, 8 combinações de fonte, zoom de 85% a 130%. Salvo no navegador de cada pessoa (não é uma configuração do sistema todo).
- **Captura de tela**: botão flutuante no canto inferior esquerdo (ícone de câmera) — baixa um PNG da tela atual.
- **Log de auditoria**: tabela `log_auditoria` com gatilhos automáticos em lançamentos (alteração/exclusão), metas e tipos de serviço. Tela em Configurações → Log do sistema (Administrador vê tudo; Gerência só das suas unidades).
- **Senha padrão + troca obrigatória**: usuário novo (ou com senha redefinida) recebe `jmacedo001` e é obrigado a trocar no próximo login (`/trocar-senha`).
- **Painel de TV**: tema claro, logo maior no canto superior direito, e uma 4ª tela na rotação com as vendas de acessórios do mês por atendente (prêmio de 5%).

### Migrações para rodar no Supabase (SQL Editor, nesta ordem)

1. `supabase/atualizacao_numero_os_10_chars.sql`
2. `supabase/atualizacao_view_contas_a_receber.sql`
3. `supabase/fase2_log_e_acessorios.sql`

### Nova variável de ambiente obrigatória

A criação de usuário e o reset de senha agora funcionam de verdade, mas dependem
da **service_role key** do Supabase — ela roda só no servidor (nunca no
navegador). Adicione no seu `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=sua-chave-secreta
```

Pegue em: Supabase → Project Settings → API Keys → **Secret keys**. Essa chave
dá acesso total ao banco — nunca a envie para o GitHub (o `.gitignore` já
protege o `.env.local`) nem a compartilhe em texto no chat.

## O que ainda falta (próximos passos)

- Rota de servidor para criação de usuário pela tela (`/api/criar-usuario`) usando a service_role key.
- Tela de correção/exclusão de lançamento já salvo (Supervisão/Gerência/Administrador/Diretor).
- Log de auditoria de alterações (quem mudou o quê).
- Refino visual final (cores, logotipo do Grupo J.Macedo).
