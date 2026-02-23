# ST-010 - Insight Acionavel no Dashboard

## Status
Draft
Prontidao: **BACKLOG** (aguardando priorizacao para desenvolvimento).

## User Story
Como usuario do TaskPoints PRO, quero receber um insight acionavel no dashboard para saber qual a proxima melhor acao do dia e melhorar minha consistencia.

## Objetivo
Exibir um card unico de recomendacao no dashboard, calculado a partir dos eventos recentes do proprio usuario (abandono, horario e uso de recompensas), com texto claro e acao pratica.

Nota de produto (2026-02-21): alteracoes no modulo de relatorios estao congeladas ate a conclusao das features planejadas.

## Alinhamento com Product One-Pager

- Pilar principal: `Execucao diaria`.
- Pilar secundario: `Mapeamento comportamental`.
- Comportamento-alvo: reduzir inercia de decisao com uma "proxima melhor acao" objetiva.
- KPI primario impactado: `start_to_complete_rate`.
- KPI secundario impactado: `time_to_start`.

## Telemetria minima desta ST

Eventos obrigatorios:
- `insight_generated`
- `insight_displayed`
- `insight_dismissed` (se existir acao)
- `insight_followed` (quando acao recomendada e executada)

Campos minimos por evento:
- `what`: tipo do evento.
- `when`: timestamp local + `day`.
- `context`: tipo do insight, sinal dominante, prioridade, janela analisada.
- `outcome`: insight ativo e acao tomada (ou ausencia de acao).

## Guardrails de produto

- Insight deve orientar acao concreta em linguagem simples.
- Nao trocar recomendacao a cada microevento sem necessidade.
- Nao criar alteracoes no modulo de relatorios nesta fase.

## Escopo

Inclui:
- Card "Insight do dia" no dashboard principal.
- Regra inicial de recomendacao baseada em sinais ja disponiveis no app (`events`, `tasks`, `days`, `habitExecutions`).
- Priorizacao de 1 insight por vez (sem conflito de mensagens).
- Atualizacao do insight conforme mudancas relevantes no dia.
- Estado vazio quando nao houver dados suficientes.

Nao inclui:
- Machine learning/modelo preditivo externo.
- Personalizacao manual da formula pelo usuario.
- Notificacoes push especificas do insight.
- Novas alteracoes no modulo de relatorios.

## Criterios de aceite

1. Dashboard exibe um card "Insight do dia" quando houver dados suficientes.
2. Insight traz recomendacao objetiva e acionavel (ex.: "Conclua uma task curta agora para recuperar ritmo").
3. Sistema seleciona apenas 1 insight ativo por vez, com regra deterministica de prioridade.
4. Insight usa apenas dados locais existentes (sem backend).
5. Quando nao houver dados suficientes, card mostra estado vazio com mensagem de orientacao.
6. Mudancas relevantes no dia (conclusao/abandono/resgate) atualizam o insight sem quebrar a UI.
7. Logs registram exibicao do insight e tipo da recomendacao para analise futura.

## Regras de negocio

1. Fonte de dados: apenas stores locais (`events`, `tasks`, `days`, `habitExecutions`, `meta` quando necessario).
2. Prioridade inicial de insight:
- Recuperacao de abandono (tarefas iniciadas e nao concluidas).
- Reforco de horario produtivo (janela com maior taxa historica de conclusao).
- Controle de recompensas (sugestao de acao para liberar saldo antes de novo resgate).
3. Exibir somente o insight de maior prioridade no momento.
4. Insight deve ser curto, direto e sem linguagem ambigua.
5. Em ausencia de dados minimos no periodo analisado, usar estado vazio explicativo.

## Plano tecnico

1. Dominio:
- Criar `src/domain/insights.js` com:
  - `getActionableInsight(state, referenceDate?)`
  - `deriveInsightSignals(state, referenceDate?)`
  - `rankInsights(signals)`

2. UI:
- Adicionar card no dashboard (`index.html` + `src/ui/render.js`).
- Garantir render resiliente para estado com/sem insight.

3. Eventos e logs:
- Registrar evento de exibicao do insight com tipo e contexto minimo em `src/domain/logs.js`.

4. Integracao:
- Atualizar ciclo de render para recalcular insight apos eventos-chave (task complete/uncomplete, habit execute/undo, reward redeem).

## Riscos

- Recomendacao pouco relevante em dias com baixo volume de uso.
- Excesso de variacao na mensagem por recalculo frequente.
- Dificuldade de explicar ao usuario "por que" do insight.

## Mitigacoes

- Regra simples e deterministica na V1.
- Priorizar estabilidade de insight dentro da mesma janela temporal.
- Texto com justificativa curta baseada no sinal dominante.

## Checklist

- [ ] Dominio de insight implementado
- [ ] Card de insight no dashboard implementado
- [ ] Estado vazio sem dados implementado
- [ ] Priorizacao deterministica de insight implementada
- [ ] Logs de exibicao de insight implementados
- [ ] Testes automatizados para ranking e fallback de insight
- [ ] Teste manual: validar mudanca de insight em eventos do dia

## File list

- `docs/stories/ST-010-insight-acionavel-dashboard.md`
