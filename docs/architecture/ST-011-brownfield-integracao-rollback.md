# ST-011 Brownfield - Integracao e Rollback

## Contexto
Documento de rastreabilidade tecnica brownfield para a ST-011 (Timer com Pausa por Task), criado em 2026-02-23 para consolidar pontos de integracao, riscos e procedimento de rollback.

## Pontos de integracao no sistema existente
- Start de task:
  - `src/domain/tasks.js` chama `startTaskTimer(...)` ao iniciar task.
- Conclusao de task:
  - `src/domain/tasks.js` chama `stopTaskTimer(..., "completed")` ao concluir task.
- Exclusao de task:
  - `src/domain/tasks.js` chama `stopTaskTimer(..., "deleted")` antes de remover task.
- UI:
  - `src/ui/events.js` gerencia acao de `pause/resume`.
  - `src/ui/render.js` renderiza estado e cronometro visual da sessao.
- Persistencia:
  - Store `taskTimerSessions` no IndexedDB.
  - Repositorio em `src/storage/repositories/taskTimerSessionsRepo.js`.

## Compatibilidade brownfield
- Sem remocao de stores legadas.
- Upgrade de schema com recovery consolidado para garantir `taskTimerSessions`.
- Fluxo antigo de tasks permanece funcional quando timer esta desativado por flag.

## Feature flag e rollout
- Chave: `task_timer_enabled`.
- Prioridade de resolucao:
  1. `localStorage` (`tp_flag_task_timer_enabled`)
  2. flag injetada (`__TASKPOINTS_FLAGS__.task_timer_enabled`)
  3. fallback por ambiente (`isLocalDevHost()`): ligado em dev/local e desligado em producao.

## Gatilhos de rollback
- Falha de abertura/criacao da store `taskTimerSessions` apos upgrade.
- Regressao funcional em `start`, `complete` ou `delete` causada por logica de timer.
- Ausencia recorrente de eventos obrigatorios:
  - `task_timer_started`
  - `task_timer_paused`
  - `task_timer_resumed`
  - `task_timer_stopped`

## Procedimento de rollback
1. Desativar timer por flag (`task_timer_enabled=false`) para interromper novas sessoes.
2. Validar que CRUD de tasks continua operacional sem erro.
3. Preservar dados historicos da store `taskTimerSessions` (sem exposicao em relatorios nesta fase).
4. Reexecutar verificacoes da ST-011:
   - `npm run test:app`
   - validacao manual de start/complete/delete.

## Evidencia minima de validacao
- `npm run test:app` passando (checks estruturais + comportamentais da ST-011).
- Confirmacao de schema com store `taskTimerSessions` existente no ambiente alvo.
