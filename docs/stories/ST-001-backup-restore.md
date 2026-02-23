# ST-001 - Backup e Restore de Dados

## User Story
Como usuario do TaskPoints PRO, quero exportar e importar meus dados para manter meu historico seguro e recuperavel.

## Objetivo
Permitir portabilidade dos dados locais (IndexedDB) via arquivo JSON versionado.

Nota de produto (2026-02-21): alteracoes no modulo de relatorios estao congeladas ate a conclusao das features planejadas.

## Alinhamento com Product One-Pager

- Pilar principal: `Mapeamento comportamental` (proteger e preservar historico para analise futura).
- Comportamento-alvo: aumentar confianca para registrar tudo sem medo de perder dados.
- KPI primario impactado: `daily_execution_streak` (indireto, por confiabilidade do historico).
- KPI secundario impactado: completude de dados exportaveis/importaveis por versao.

## Telemetria minima desta ST

Eventos obrigatorios:
- `backup_export_started`
- `backup_export_completed`
- `backup_import_started`
- `backup_import_failed`
- `backup_import_completed`

Campos minimos por evento:
- `what`: tipo do evento.
- `when`: timestamp local + `day`.
- `context`: `schemaVersion`, tamanho do payload, origem (arquivo local).
- `outcome`: sucesso/falha + motivo quando aplicavel.

## Guardrails de produto

- Nao perder dados historicos validos durante import.
- Nao aceitar payload invalido silenciosamente.
- Nao alterar modulo de relatorios nesta ST.

## Escopo

Inclui:
- Exportacao de todas as stores do app.
- Download de arquivo JSON.
- Importacao de arquivo JSON.
- Validacao de schema/version.
- Mensagens de erro/sucesso.

Nao inclui:
- Sincronizacao em nuvem.
- Merge inteligente entre datasets.
- Novas alteracoes no modulo de relatorios.

## Criterios de aceite

1. Exporta `meta`, `days`, `tasks`, `rewards`, `events`, `habitTemplates`, `habitExecutions`.
2. Arquivo exportado contem `app`, `exportedAt`, `schemaVersion`, `data`.
3. Importacao recusa arquivo sem estrutura valida.
4. Importacao recusa versao incompatível com mensagem clara.
5. Importacao bem-sucedida atualiza UI apos reload/re-render.

## Plano tecnico

1. Criar modulo `src/domain/backup.js`:
- `exportAllData(state)`
- `validateBackupPayload(payload)`
- `importAllData(state, payload)`

2. Criar utilitarios de I/O:
- serializacao JSON segura.
- download em blob.
- leitura de arquivo selecionado.

3. Adicionar entradas na UI:
- botao "Exportar dados"
- botao "Importar dados"

4. Garantir logs de sistema para import/export.

## Riscos

- Corrupcao por import parcial.
- Arquivo grande para usuarios com historico extenso.
- Compatibilidade futura de schema.

## Mitigacoes

- Importar em transacao por store com validacao previa.
- Incluir `schemaVersion` e `appVersion`.
- Bloquear import sem backup valido.

## Checklist

- [x] Dominio de backup implementado
- [x] Acoes de UI implementadas
- [x] Validacoes de payload implementadas
- [ ] Teste manual: export -> limpar -> import -> validar dados
- [ ] Documentacao atualizada no README (se necessario)

## File list

- `index.html`
- `src/app/constants.js`
- `src/domain/backup.js`
- `src/domain/logs.js`
- `src/ui/events.js`
- `docs/stories/ST-001-backup-restore.md`
