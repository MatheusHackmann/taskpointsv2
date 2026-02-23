# README-Driven Product Evolution

## Contexto
Fonte base: `README.md` do projeto TaskPoints PRO.

Objetivo: transformar o que ja existe em um plano claro de evolucao de produto, pronto para priorizacao e execucao.

## Diretriz ativa (2026-02-21)

- Congelamento de relatorios: ate a conclusao de todas as features planejadas, nenhuma ST (existente ou futura) deve incluir tarefas de implementacao, ajuste visual ou novas regras no modulo de relatorios.
- Qualquer demanda de relatorio deve ser registrada como adiada para fase posterior de refatoracao dedicada.

## Relatorio rapido de maturidade

Status atual:
- Produto funcional em frontend local com IndexedDB.
- Loop principal de valor (tarefas -> pontos -> recompensas).
- Boa base de telemetria via eventos.

Gaps de produto:
- Sem conta/login/sincronizacao.
- Sem distribuicao multi-dispositivo.
- Sem onboarding orientado.
- Sem metas/objetivos semanais formais.
- Sem mecanismo de retencao baseado em cohort/KPI no app.

## Metas de produto (90 dias)

1. Aumentar retencao D7 do usuario ativo.
2. Aumentar taxa de conclusao diaria de tarefas.
3. Reduzir abandono de tarefas iniciadas.
4. Elevar recorrencia de uso do dashboard.

## KPIs recomendados

- `% dias com uso no periodo`
- `taxa de conclusao de tarefas`
- `abandono = starts - completes`
- `pontos liquidos por dia`
- `uso de recompensas por semana`

## Roadmap por fases

## Fase 1 (Fundacao de produto)

- Autenticacao local + perfil.
- Backup/restore manual de dados (JSON).
- Onboarding com setup inicial (templates + habitos + primeira recompensa).
- Definicao de objetivos semanais.

## Fase 2 (Retencao e engajamento)

- Metas semanais com barra de progresso.
- Missao diaria automatica baseada em historico.
- Recomendacoes simples ("proxima melhor acao") no dashboard.
- Reforco de habitos com lembretes contextualizados por horario.

## Fase 3 (Inteligencia e escala)

- Sincronizacao em nuvem (conta opcional).
- Painel de tendencias mensais.
- Segmentacao de comportamento (perfil consistencia/procrastinacao).
- Sugestoes inteligentes para reduzir abandono.

## Backlog inicial priorizado (P0/P1/P2)

## P0

1. **ST-001 - Backup e restore de dados**
- Como usuario, quero exportar/importar meus dados para nao perder historico.
- Criterios de aceite:
- Exporta todas stores do IndexedDB para JSON.
- Importa JSON validando estrutura e versao.
- Fluxo de erro amigavel para arquivo invalido.

2. **ST-002 - Onboarding inicial**
- Como novo usuario, quero configurar rapidamente meu ambiente de produtividade.
- Criterios de aceite:
- Wizard curto (3-4 passos).
- Define templates de tasks, 1-3 habitos e recompensas iniciais.
- Nao bloqueia uso livre do app.

3. **ST-003 - Metas semanais**
- Como usuario, quero meta semanal de pontos para acompanhar consistencia.
- Criterios de aceite:
- Cadastro de meta semanal.
- Exibicao de progresso semanal.
- Sem alteracoes no modulo de relatorios nesta fase.

## P1

1. **ST-004 - Objetivos por categoria (Saude, Trabalho, Estudo)**
- Classificacao de tasks/habitos por categoria.
- Sem alteracoes no modulo de relatorios nesta fase.

2. **ST-005 - Sistema de Pontuacao Adaptativo (Tasks, Habitos e Recompensas)**
- Pontuacao automatica para tasks/habitos.
- Custo de recompensa adaptativo por onboarding e resgates no dia.

3. **ST-010 - Insight acionavel no dashboard**
- Card com recomendacao objetiva do dia.
- Baseado em eventos recentes (abandono/horario/recompensas).

4. **ST-006 - Historico mensal**
- Visao mensal de pontos, completude e streak.

## P2

1. **ST-007 - Sincronizacao multi-dispositivo**
2. **ST-008 - Score comportamental**
3. **ST-009 - Metas adaptativas por perfil**

## Plano de execucao sugerido (primeiros 14 dias)

Semana 1:
1. ST-001 Backup/Restore
2. ST-002 Onboarding

Semana 2:
1. ST-003 Metas semanais
2. Instrumentacao de KPI basica em `events`

## Decisoes de produto ja tomadas neste kickoff

1. Prioridade inicial: **seguranca de dados + ativacao de usuario**.
2. Roadmap orientado por **retencao e consistencia**, nao por volume de features.
3. Telemetria continua como base para futuras decisoes.

## Checklist da story

- [x] Diagnostico do produto atual a partir do README
- [x] Definicao de metas e KPIs
- [x] Backlog priorizado (P0/P1/P2)
- [x] Plano de execucao inicial (14 dias)

## File list

- `docs/stories/README-driven-product-evolution.md`
