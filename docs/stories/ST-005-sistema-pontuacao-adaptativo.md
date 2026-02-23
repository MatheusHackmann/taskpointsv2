# ST-005 - Sistema de Pontuacao Adaptativo (Tasks, Habitos e Recompensas)

## User Story
Como usuario do TaskPoints PRO, quero que a pontuacao de tarefas/habitos e os custos de recompensas sejam calculados automaticamente para manter o sistema justo, motivador e sustentavel.

## Objetivo
Remover a dependencia de pontos manuais e aplicar um modelo psicologico com onboarding motivador e progressao de custo no mesmo dia.

Nota de produto (2026-02-21): alteracoes no modulo de relatorios estao congeladas ate a conclusao das features planejadas.

## Alinhamento com Product One-Pager

- Pilar principal: `Reforco psicologico`.
- Pilar secundario: `Execucao diaria`.
- Comportamento-alvo: trocar gratificacao impulsiva por recompensa vinculada a execucao real.
- KPI primario impactado: `post_completion_reward_rate`.
- KPI secundario impactado: `start_to_complete_rate`.

## Telemetria minima desta ST

Eventos obrigatorios:
- `task_points_calculated`
- `habit_points_calculated`
- `reward_base_cost_calculated`
- `reward_adaptive_cost_calculated`
- `reward_redeemed`

Campos minimos por evento:
- `what`: tipo do evento.
- `when`: timestamp local + `day`.
- `context`: fatores usados no calculo (duracao, complexidade, nivel, resgates do dia, fase de onboarding).
- `outcome`: pontos/custo final aplicado.

## Guardrails de produto

- Nao incentivar resgate compulsivo sem progresso real.
- Nao criar regras opacas impossiveis de explicar.
- Nao alterar modulo de relatorios nesta ST.

## Escopo

Inclui:
- Pontos de task calculados por duracao, complexidade, friccao e impacto.
- Pontos de habito calculados por nivel, esforco e alvo diario.
- Custo base de recompensa calculado por classe + valor subjetivo.
- Fator de onboarding (semanas iniciais mais acessiveis).
- Escalada de custo de recompensa por quantidade de resgates no dia.

Nao inclui:
- Personalizacao livre de formulas pelo usuario final.
- A/B testing de fatores psicologicos.
- Novas alteracoes no modulo de relatorios.

## Criterios de aceite

1. Cadastro de task nao depende mais de pontos manuais.
2. Cadastro de habito nao depende mais de pontos manuais.
3. Cadastro de recompensa nao depende mais de custo manual.
4. Recompensas mostram custo adaptativo do dia.
5. Resgate usa o custo adaptativo do momento, mantendo debito em pontos do dia/carteira.
6. Fase inicial oferece custos mais acessiveis e escala ao longo das semanas.
7. Cada resgate adicional no dia aumenta custo das proximas recompensas.

## Checklist

- [x] Motor `pointsEngine` criado
- [x] Task com pontos automaticos por parametros
- [x] Habito com pontos automaticos por parametros
- [x] Recompensa com custo base automatico
- [x] Custo adaptativo por onboarding + resgates do dia
- [x] UI atualizada para novo fluxo sem pontos/custos manuais
- [x] lint / typecheck / test executados

## File list

- `src/domain/pointsEngine.js`
- `src/domain/rewards.js`
- `src/domain/habits.js`
- `src/domain/logs.js`
- `src/ui/events.js`
- `src/ui/render.js`
- `index.html`
- `styles/main.css`
- `docs/stories/ST-005-sistema-pontuacao-adaptativo.md`
