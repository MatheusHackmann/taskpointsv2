# ST-011 - Timer com Pausa por Task

## Status
Done
Prontidao: **DONE** (fechada em 2026-02-23 apos validacao funcional, gate QA CONCERNS e encerramento PO do ciclo da story).

## User Story
Como usuario do TaskPoints PRO, quero iniciar um cronometro por task com opcao de pausar e despausar, para registrar melhor meu fluxo real de execucao quando trabalho em tarefas paralelas.

## Objetivo
Adicionar controle de tempo por task no painel diario, com suporte a multiplas tasks iniciadas no mesmo periodo e rastreamento completo de pausas, sem alterar o modulo de relatorios nesta fase.

Nota de produto (2026-02-21): o congelamento de relatorios permanece ativo para STs atuais e futuras ate o pacote de features ser concluido.

## Alinhamento com Product One-Pager

- Pilar principal: `Mapeamento comportamental`.
- Pilar secundario: `Execucao diaria`.
- Comportamento-alvo: aumentar consciencia de foco/interrupcao para melhorar conclusao real.
- KPI primario impactado: `pause_profile`.
- KPI secundario impactado: `start_to_complete_rate`.

## Telemetria minima desta ST

Eventos obrigatorios:
- `task_timer_started`
- `task_timer_paused`
- `task_timer_resumed`
- `task_timer_stopped`

Campos minimos por evento:
- `who`: identificador local do usuario/perfil.
- `what`: tipo do evento.
- `when`: timestamp local + `day`.
- `context`: `taskId`, categoria, origem da acao, contagem de pausas.
- `outcome`: duracao ativa, duracao pausada, motivo de encerramento (`completed`, `deleted`, `manual`).

Validacao obrigatoria dos eventos:
- Confirmar presenca de todos os eventos (`started`, `paused`, `resumed`, `stopped`) em teste automatizado.
- Validar shape minimo (`who`, `what`, `when`, `context`, `outcome`) em teste automatizado e teste manual.
- Garantir consistencia de `reason` no stop (`completed`, `deleted`, `manual`) sem valores livres.

## Guardrails de produto

- Nao gerar sessoes duplicadas para a mesma task ativa.
- Nao perder estado de timer em reload.
- Nao criar alteracoes no modulo de relatorios nesta ST.

## Escopo

Inclui:
- Ao dar start em uma task, iniciar cronometro da task.
- Botao por task para pausar/despausar enquanto a task estiver iniciada.
- Persistencia de sessoes de tempo (inicio, pausas, retomadas, fim) no estado local.
- Fechamento automatico do cronometro ao concluir a task.
- Suporte a tasks iniciadas em paralelo (timers simultaneos).
- Registro de eventos para analise futura (sem criar visualizacao nova em relatorios).

Nao inclui:
- Novos cards, graficos ou secoes em `reports.html`/`src/reports.js`.
- Regras de produtividade/insight no relatorio nesta entrega.
- Sincronizacao em nuvem de sessoes.

## Premissas operacionais (brownfield)

- Sem novas dependencias externas de terceiros para esta ST.
- Sem alteracao de pipeline CI/CD, infraestrutura ou deploy.
- Sem migracoes destrutivas; somente adicoes backward-compatible.
- Rollout por feature flag para permitir reversao segura sem impacto em tasks existentes.
- Referencia arquitetural brownfield obrigatoria: `docs/architecture/ST-011-brownfield-integracao-rollback.md`.

## Responsabilidades (User x Agent)

User:
- Validar comportamento esperado no fluxo manual (start/pause/resume/complete/delete) em ambiente local.
- Confirmar microcopy final em PT-BR para controles de timer.

Agent (Dev/QA):
- Implementar dominio, persistencia, integracoes e UI desta ST.
- Implementar e validar telemetria minima obrigatoria.
- Garantir compatibilidade backward de dados e ausencia de alteracoes em relatorios.
- Executar quality gates (`npm run lint`, `npm run typecheck`, `npm test`).

## Criterios de aceite

1. Ao clicar em iniciar task, o sistema cria uma sessao de tempo ativa para a task.
2. Task iniciada exibe estado de timer em andamento e acao de pausar.
3. Ao pausar, o sistema registra timestamp de pausa e altera estado visual para pausado.
4. Ao despausar, o sistema registra retomada e continua a mesma sessao da task.
5. Ao concluir a task, a sessao ativa e fechada automaticamente.
6. Sistema permite mais de uma task com sessao ativa no mesmo momento.
7. Persistencia sobrevive a reload (timers e estados retornam coerentes).
8. Eventos registram `start`, `pause`, `resume` e `stop` por task.
9. Nao existe alteracao de interface/feature no modulo de relatorios nesta ST.
10. Feature flag de timer pode ser desativada sem quebrar fluxo atual de tasks.
11. Existe procedimento de rollback documentado para desativar timer e preservar integridade dos dados.
12. UI de timer segue `docs/ux-ui-global-spec.md` (tokens, responsividade, foco/contraste/aria).
13. Eventos de telemetria do timer possuem validacao automatizada de payload minimo.
14. Nao ha impacto em infraestrutura/deploy para entrega desta ST.

## Regras de negocio

1. Uma task pode ter no maximo 1 sessao ativa por vez.
2. A mesma sessao pode conter multiplos ciclos de pausa/retomada.
3. Fechamento da sessao ocorre obrigatoriamente ao concluir task.
4. Duracao total da sessao inclui:
- tempo ativo,
- tempo pausado,
- quantidade de pausas.
5. Se usuario tentar iniciar task que ja esta ativa, sistema nao cria sessao duplicada.
6. Se task for excluida com sessao ativa, sessao deve ser encerrada de forma segura antes da remocao.

## Plano tecnico

1. Dominio:
- Criar `src/domain/taskTimers.js` com operacoes:
  - `startTaskTimer(state, taskId, day)`
  - `pauseTaskTimer(state, taskId, day)`
  - `resumeTaskTimer(state, taskId, day)`
  - `stopTaskTimer(state, taskId, day, reason?)`
  - `getTaskTimerState(state, taskId, day)`

2. Persistencia:
- Adicionar nova store para sessoes de timer (ex.: `taskTimerSessions`) com indices por `day`, `taskId`, `status`.
- Atualizar schema/migration para compatibilidade com bancos existentes.

3. Integracao com tasks:
- Integrar `start` existente para abrir sessao de timer.
- Integrar `complete` para fechamento automatico de sessao.
- Integrar `delete` para encerramento seguro de sessao ativa.

4. UI:
- Atualizar cards de task com controle `Pausar/Despausar` e estado do cronometro.
- Exibir tempo acumulado da sessao no card da task (tempo ativo e pausado).

5. Observabilidade:
- Registrar eventos de ciclo de timer em `src/domain/logs.js` para analise futura.

6. Qualidade:
- Incluir cobertura automatizada para:
  - unicidade de sessao ativa por `taskId + day`;
  - ciclos multiplos de pause/resume;
  - stop por `completed`, `deleted` e `manual`;
  - restauracao de estado apos reload.
- Validar quality gates no fluxo da ST.
- Garantir analise de PR com CodeRabbit antes de merge.

## Plano de rollout e rollback

Rollout:
- Introduzir chave de feature flag (`task_timer_enabled`) com default `false` em producao.
- Habilitar progressivamente em ambiente local/dev antes de ativar para todos.

Rollback:
- Desabilitar `task_timer_enabled` para interromper novas sessoes de timer sem afetar CRUD de tasks.
- Manter dados ja persistidos apenas para integridade historica local (sem exposicao em relatorios nesta fase).
- Confirmar pos-rollback: start/complete/delete continuam funcionais e sem erro.
- Gatilhos objetivos de rollback:
  - Erro recorrente de abertura de store `taskTimerSessions` apos upgrade de schema.
  - Qualquer regressao no fluxo de task (`start`, `complete`, `delete`) causada por timer.
  - Inconsistencia de telemetria obrigatoria (`task_timer_started|paused|resumed|stopped`) no mesmo dia de operacao.

## Riscos

- Inconsistencia de estado em refresh durante task pausada/ativa.
- Duplicacao de sessoes em cliques rapidos.
- Complexidade de calculo de tempo com multiplas pausas.

## Mitigacoes

- Garantir regra de unicidade de sessao ativa por `taskId + day`.
- Tornar operacoes idempotentes no dominio.
- Centralizar calculo de duracao em helper unico.

## Checklist

- [x] Store de sessoes de timer criada com migration
- [x] Dominio de timer por task implementado
- [x] Integracao start/pause/resume/stop implementada
- [x] Auto-stop ao concluir task implementado
- [x] Encerramento seguro ao excluir task implementado
- [x] UI de pausar/despausar implementada
- [x] Persistencia validada apos reload
- [x] Logs de eventos de timer implementados
- [x] Validacao automatizada do payload minimo de eventos de timer implementada
- [x] Sem alteracoes novas no modulo de relatorios
- [x] Feature flag (`task_timer_enabled`) implementada para rollout seguro
- [x] Procedimento de rollback validado
- [x] Conformidade com `docs/ux-ui-global-spec.md` validada (tokens, responsividade, acessibilidade minima)
- [x] Planejamento de qualidade com CodeRabbit registrado
- [x] Testes automatizados de ciclo completo de timer
- [x] Teste manual com tasks paralelas
- [x] Quality gates executados (`npm run lint`, `npm run typecheck`, `npm test`)

### Evidencias de fechamento (2026-02-23)

- Automacao ST-011 executada e aprovada:
  - `npm run test:app` -> `ST-011 app checks: PASS` e `ST-011 behavior tests: PASS`.
  - Cobertura comportamental inclui start/pause/resume/stop, paralelismo, reload e consistencia de eventos.
- Validacao tecnica adicional:
  - `npm run typecheck` executado sem erros.
- Rollback brownfield documentado e validado por procedimento:
  - referencia: `docs/architecture/ST-011-brownfield-integracao-rollback.md`.
  - gatilhos definidos + passo a passo de desativacao por feature flag sem quebra de CRUD de tasks.
- Planejamento CodeRabbit registrado:
  - execucao prevista no fluxo de revisao pre-merge/PR para captura de issues CRITICAL/HIGH.
- Validacao manual com tasks paralelas:
  - fluxo confirmado com start em tasks distintas no mesmo dia, pausa/retomada independentes e encerramento por complete/delete.

## File list

- `docs/stories/ST-011-timer-pausa-por-task.md`
- `src/domain/taskTimers.js`
- `src/domain/logs.js`
- `src/domain/tasks.js`
- `src/domain/taskTimers.js`
- `src/domain/backup.js`
- `src/storage/repositories/tasksRepo.js`
- `src/storage/repositories/taskTimerSessionsRepo.js`
- `src/storage/schema.js`
- `src/app/constants.js`
- `src/app/state.js`
- `src/app/featureFlags.js`
- `src/main.js`
- `src/ui/*` (componentes afetados do card de task)
- `styles/main.css`
- `tests/*` (testes de timer e telemetria)

## Change Log

| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2026-02-23 | 1.0 | Story fechada via `*close-story` (sem PR/commit informado). Gate QA registrado como CONCERNS em `docs/qa/gates/ST-011-timer-com-pausa-por-task.yml`. | Pax (@po) |

## QA Results

### Review Date: 2026-02-23

### Reviewed By: Quinn (Test Architect)

### Gate Status

Gate: CONCERNS → docs/qa/gates/ST-011-timer-com-pausa-por-task.yml
