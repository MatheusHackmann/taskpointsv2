# TaskPoints: Deploy no Vercel + Supabase

## Objetivo
Deixar o frontend com deploy automatico no Vercel e o banco versionado por migrations no Supabase.

## Variaveis de ambiente no Vercel

Cadastre estas variaveis no projeto do Vercel para `Production`:

- `TASKPOINTS_SUPABASE_URL`
- `TASKPOINTS_SUPABASE_ANON_KEY`
- `TASKPOINTS_STORAGE_BACKEND`
- `TASKPOINTS_SUPABASE_SCHEMA`
- `TASKPOINTS_ENABLE_TASK_TIMER`

Valores recomendados:

- `TASKPOINTS_STORAGE_BACKEND=supabase`
- `TASKPOINTS_SUPABASE_SCHEMA=public`
- `TASKPOINTS_ENABLE_TASK_TIMER=false`

Observacoes:

- `SUPABASE_SERVICE_ROLE_KEY` nao deve ir para o Vercel frontend.
- `DATABASE_URL` e usada apenas para operacoes de banco e CLI.

## Build e deploy do frontend

O Vercel executa:

```bash
npm run build
```

Esse build gera o arquivo `config.js` com os valores do ambiente atual.

Fluxo de atualizacao:

1. Fazer alteracoes no codigo.
2. Abrir PR e validar qualidade.
3. Fazer merge em `main`.
4. O Vercel redeploya automaticamente.

## Deploy do banco

Mantenha todas as alteracoes de schema em `supabase/migrations/`.

Fluxo de atualizacao:

1. Criar nova migration SQL.
2. Testar localmente com Supabase local.
3. Linkar o projeto remoto:

```bash
supabase link --project-ref <project-ref>
```

4. Aplicar migrations:

```bash
npm run db:push
```

## Dados iniciais

Se precisar importar dados do backup do IndexedDB:

```bash
npm run migrate:indexeddb:to:postgres -- --input <backup.json> --output supabase/migrations/<timestamp>_import.sql
```

Depois aplique a migration gerada no ambiente desejado.

## Atualizacao simples no futuro

- App: `git push` no branch de producao.
- Banco: nova migration + `npm run db:push`.

Nao edite schema manualmente no painel do Supabase se quiser manter o fluxo reproduzivel.

## Observacao sobre senha do banco

Se a senha do Postgres tiver caracteres especiais como `@`, `#`, `!` ou `%`, encode esses caracteres na `DATABASE_URL` antes de usar em CLI e integracoes.
