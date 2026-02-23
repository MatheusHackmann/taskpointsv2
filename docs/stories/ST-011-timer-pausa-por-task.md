# ST-011 - Timer com Pausa por Task

## Status
Draft
Prontidao: **BACKLOG** (aguardando priorizacao para desenvolvimento).

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
- `what`: tipo do evento.
- `when`: timestamp local + `day`.
- `context`: `taskId`, categoria, origem da acao, contagem de pausas.
- `outcome`: duracao ativa, duracao pausada, motivo de encerramento (`completed`, `deleted`, `manual`).

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

## Riscos

- Inconsistencia de estado em refresh durante task pausada/ativa.
- Duplicacao de sessoes em cliques rapidos.
- Complexidade de calculo de tempo com multiplas pausas.

## Mitigacoes

- Garantir regra de unicidade de sessao ativa por `taskId + day`.
- Tornar operacoes idempotentes no dominio.
- Centralizar calculo de duracao em helper unico.

## Checklist

- [ ] Store de sessoes de timer criada com migration
- [ ] Dominio de timer por task implementado
- [ ] Integracao start/pause/resume/stop implementada
- [ ] Auto-stop ao concluir task implementado
- [ ] Encerramento seguro ao excluir task implementado
- [ ] UI de pausar/despausar implementada
- [ ] Persistencia validada apos reload
- [ ] Logs de eventos de timer implementados
- [ ] Sem alteracoes novas no modulo de relatorios
- [ ] Testes automatizados de ciclo completo de timer
- [ ] Teste manual com tasks paralelas

## File list

- `docs/stories/ST-011-timer-pausa-por-task.md`
