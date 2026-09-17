# Consulta de Peças — Grupo J.Macedo

Sistema de consulta de custo de peças (Modelo, Categoria, Código, Descrição,
Valor Unitário) para montar orçamento ao cliente. Mesmo padrão do Caixa
Online: Next.js + Supabase, deploy no Vercel.

## Estrutura de telas

| Rota | Tela | Quem acessa |
|---|---|---|
| `/login` | Login (nome.sobrenome) | Todos |
| `/pecas` | Consulta de custo de peças | Todos os usuários logados |
| `/configuracoes/carregar-bases` | Upload e processamento das bases | Administrador |
| `/configuracoes/usuarios` | Criar/editar/bloquear/excluir usuários | Administrador, Diretor, Gerente |

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) → **New project** (projeto
   separado do Caixa Online, conforme combinado).
2. Em **SQL Editor → New query**, cole e rode o conteúdo de
   `supabase/schema.sql`. Isso cria as tabelas `perfis`, `pecas` e
   `pecas_processamentos`, com as permissões (RLS) já configuradas.

## 2. Criar o primeiro usuário (Administrador)

1. No Supabase, vá em **Authentication → Users → Add user**.
   - Email: `seu.login@pecas.jmacedo.internal` (troque `seu.login` pelo login
     desejado, ex: `joao.macedo@pecas.jmacedo.internal`)
   - Senha: defina uma senha temporária.
2. Copie o **UUID** do usuário criado.
3. Em **SQL Editor**, rode substituindo os valores:

```sql
insert into perfis (id, login, nome, cargo) values
('COLE-O-UUID-AQUI', 'joao.macedo', 'João Macedo', 'Administrador');
```

Esse é o único usuário que precisa ser criado manualmente pelo Supabase —
todos os demais são criados pela própria tela **Configurações → Usuários**
dentro do sistema, já com senha inicial `samsungcontigo001`.

Cargos aceitos: `Administrador`, `Diretor`, `Gerente`, `Vendedor`, `Estoque`,
`Cliente`. Só `Administrador` acessa Carregar Bases. Administrador, Diretor
e Gerente acessam Usuários.

## 3. Configurar as variáveis de ambiente

1. Copie `.env.local.example` para `.env.local`.
2. Preencha com os dados do seu projeto (Supabase → Project Settings → API →
   aba "Legacy anon, service_role API keys"):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (fica só no servidor — nunca aparece no
     navegador. Necessária para criar/excluir usuários e resetar senhas,
     operações administrativas do Supabase Auth.)

## 4. Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

## 5. Logos

Coloque os arquivos reais do Caixa Online em `public/logos/`:
- `grupo-jmacedo.png`
- `grupo-macedo-maschetti.png`

## 6. Deploy no Vercel

1. Suba este projeto para um repositório no GitHub.
2. No [vercel.com](https://vercel.com) → **New Project** → importe o
   repositório.
3. Em **Environment Variables**, adicione as três variáveis do passo 3
   (incluindo a `SUPABASE_SERVICE_ROLE_KEY`).
4. Deploy. A partir daí, todo `git push` atualiza o site sozinho.

## O que já está pronto

- Login com Supabase Auth (padrão `nome.sobrenome`).
- Modo claro/escuro (botão no cabeçalho, salvo no navegador).
- Processamento das bases **no navegador** (evita o limite de tamanho de
  requisição de funções de servidor no Vercel): remove duplicados da Base
  Peças, classifica a Descrição Resumida por palavra-chave, deriva a
  Categoria, cruza com a Base GSPN e grava o valor unitário sempre pela
  **compra mais recente** direto no Supabase.
- Consulta com busca combinada (vários termos, qualquer campo) e filtro por
  categoria, com margem editável e preço de venda sugerido em `R$ 0.000,00`.
- Controle de acesso: só Administrador/Diretor processam bases; qualquer
  usuário logado consulta preços. As permissões são garantidas pelo RLS do
  Postgres (função `is_admin_ou_diretor()`), não só pela interface.
- Log de auditoria de cada processamento (`pecas_processamentos`): quem
  processou, quando, quantos registros, quantos duplicados removidos etc.

## Próximos passos possíveis

- Tela de cadastro de usuários pela própria interface (hoje é manual pelo
  Supabase).
- Busca sem sensibilidade a acento (extensão `unaccent` do Postgres) —
  hoje a busca já ignora maiúsc./minúsc., mas "refrigerador" com/sem acento
  em outras palavras pode não bater 100% das vezes.
- Exportar resultado da busca para PDF/Excel (orçamento pronto pro cliente).
- Histórico de preço por peça (não só o mais recente).
