# ST-003 - Metas Semanais de Pontos

## User Story
Como usuario do TaskPoints PRO, quero definir uma meta semanal de pontos para acompanhar minha consistencia e ajustar meu ritmo durante a semana.

## Objetivo
Adicionar um ciclo semanal de metas com progresso visivel no dashboard.

Nota de produto (2026-02-21): atividades de relatorio ficam congeladas/adiadas para uma futura fase de refatoracao dedicada.

## Alinhamento com Product One-Pager

- Pilar principal: `Execucao diaria`.
- Pilar secundario: `Reforco psicologico`.
- Comportamento-alvo: manter consistencia semanal com feedback frequente de progresso.
- KPI primario impactado: `daily_execution_streak`.
- KPI secundario impactado: `start_to_complete_rate`.

## Telemetria minima desta ST

Eventos obrigatorios:
- `weekly_goal_set`
- `weekly_goal_updated`
- `weekly_goal_progress_viewed`
- `weekly_goal_level_unlocked`

Campos minimos por evento:
- `what`: tipo do evento.
- `when`: timestamp local + semana de referencia.
- `context`: `goalPoints`, nivel, pontos acumulados, percentual.
- `outcome`: progresso atual e mudanca de estado (`ongoing`, `achieved`, `missed`).

## Guardrails de produto

- Nao punir usuario por oscilacoes de um dia isolado.
- Reforcar consistencia sustentavel, nao intensidade extrema.
- Nao criar alteracoes no modulo de relatorios nesta fase.

## Escopo

Inclui:
- Definicao de meta semanal (valor em pontos).
- Presets de niveis semanais com nomes motivadores e bonus por nivel.
- Calculo automatico de pontos acumulados na semana atual.
- Indicador de progresso semanal no painel principal.

Nao inclui:
- Metas adaptativas por perfil (fica para ST-009).
- Metas por categoria (fica para ST-004).
- Novas alteracoes no modulo de relatorios (congelado nesta fase).

## Criterios de aceite

1. Usuario consegue cadastrar/editar meta semanal em pontos.
2. Sistema calcula progresso da semana atual (segunda a domingo) com base no saldo diario.
3. Dashboard exibe:
- meta da semana,
- pontos acumulados,
- percentual de progresso.
4. Dashboard exibe snapshot semanal com status:
- em andamento,
- meta atingida,
- meta nao atingida.
5. Usuario consegue selecionar presets de nivel no modal (Nivel 1, Nivel 2...).
6. Ao superar nivel semanal, sistema aplica bonus de pontos apenas uma vez por nivel na semana.
7. Bonus de nivel fica em saldo acumulado permanente (nao expira por dia).
8. Se nao houver meta definida, UI mostra estado vazio com CTA para configurar.
9. Dados da meta e recompensas semanais persistem no IndexedDB e sobrevivem a reload.

## Regras de negocio

1. Semana padrao: segunda-feira 00:00 ate domingo 23:59 (fuso local).
2. Progresso semanal usa pontos liquidos por dia (`days.totalPoints`).
3. Percentual = `min(100, acumulado/meta * 100)` quando meta > 0.
4. Metas invalidas (<= 0) devem ser rejeitadas.
5. Bonus de nivel semanal nao pode ser concedido mais de uma vez por nivel/semana.
6. Resgate de recompensa consome primeiro pontos do dia e depois saldo acumulado permanente.

## Plano tecnico

1. Persistencia:
- Adicionar chave de meta semanal em `meta` store (ex.: `weekly_goal_points_v1`).

2. Dominio:
- Criar `src/domain/weeklyGoals.js` com:
- `getWeeklyGoal(state)`
- `setWeeklyGoal(state, points)`
- `getWeeklyProgress(state, referenceDate?)`

3. UI dashboard:
- Exibir card de progresso semanal na home (`index.html` + `src/ui/render.js`).
- Botao para configurar meta (modal simples com input numerico).

4. Relatorios:
- Adiado por diretriz de produto; nao implementar alteracoes nesta ST.

5. Logs:
- Registrar eventos de configuracao/atualizacao de meta semanal.

## Riscos

- Ambiguidade de semana (fuso/virada de dia).
- Conflito de interpretacao entre pontos diarios positivos e negativos.

## Mitigacoes

- Centralizar calculo de janela semanal em utilitario unico.
- Documentar regra no README e no proprio card de meta.

## Checklist

- [x] Persistencia da meta semanal implementada
- [x] Regras de calculo semanal implementadas
- [x] Card de progresso semanal no dashboard implementado
- [x] Snapshot semanal no dashboard implementado
- [x] Logs de alteracao de meta implementados
- [x] Presets de niveis implementados
- [x] Bonus por superacao de nivel semanal implementado
- [x] Saldo acumulado permanente (wallet semanal) implementado
- [x] Cadastro de meta semanal manual com bloqueio de edicao/exclusao da meta ativa
- [x] Modal de cadastro limpa campos e bloqueia inputs enquanto houver meta ativa
- [x] Texto abaixo da barra padronizado para "Semana em andamento: dd/mm/aaaa -> dd/mm/aaaa + Nome da Meta"
- [x] Datas da feature de meta semanal exibidas em formato BR (dd/mm/aaaa)
- [x] Progresso semanal nao sofre reducao em resgates de recompensa (desconto apenas no saldo do dia/carteira)
- [ ] Teste manual: configurar meta, completar semana, validar progresso

## File list

- `src/domain/weeklyGoals.js`
- `src/domain/logs.js`
- `src/domain/rewards.js`
- `src/app/constants.js`
- `src/ui/render.js`
- `src/ui/events.js`
- `index.html`
- `styles/main.css`
- `src/domain/dates.js`
- `src/domain/logs.js`
- `src/domain/rewards.js`
- `src/domain/weeklyGoals.js`
- `README.md`
- `docs/stories/ST-003-metas-semanais.md`
