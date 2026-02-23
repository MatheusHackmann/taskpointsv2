# Product One-Pager - TaskPoints

## Status
Versao: `v1.0`  
Data: `2026-02-21`  
Escopo: diretriz oficial de produto para PO/PM/Dev/QA.

## Visao
TaskPoints e um sistema de execucao pessoal que combina controle de tasks, arquitetura de recompensas e mapeamento comportamental para transformar pessoas procrastinadoras em executoras consistentes.

## Problema central
Pessoas nao falham por falta de metas. Falham por:
- atrito para iniciar;
- interrupcoes sem retomada;
- reforco psicologico mal distribuido;
- baixa clareza sobre o que realmente funciona na propria rotina.

## Promessa do produto
Trocar o ciclo `planejar demais -> fazer pouco -> frustracao` por `executar -> reforcar -> evoluir`.

## Publico-alvo inicial
- Pessoas que procrastinam tarefas importantes no dia a dia.
- Pessoas que ja tentaram listas/habitos, mas nao sustentam consistencia.

## Pilares obrigatorios (feature fit)
Toda nova feature deve contribuir explicitamente para ao menos 1 pilar:
1. `Execucao diaria`: aumentar inicio e conclusao real de tasks.
2. `Reforco psicologico`: usar recompensas para consolidar comportamento produtivo.
3. `Mapeamento comportamental`: capturar dados diarios acionaveis para inteligencia futura.

Se nao houver contribuicao clara para nenhum pilar, a feature nao deve seguir.

## Principios de design de comportamento
1. Comecar pequeno: reduzir friccao de inicio.
2. Reforcar acao concluida: evitar premiar apenas intencao.
3. Clareza de proxima acao: sempre orientar o que fazer agora.
4. Consistencia > intensidade: favorecer repeticao sustentavel.
5. Feedback rapido: retorno imediato apos acao relevante.
6. Transparencia: regras de pontuacao/recompensa compreensiveis.

## Loop comportamental do produto
1. `Gatilho`: lembrar a acao certa no momento certo.
2. `Acao minima`: facilitar o primeiro passo.
3. `Reforco`: recompensa contextual e proporcional.
4. `Registro`: salvar evento e contexto.
5. `Insight`: orientar proxima melhor acao.

## Metricas norte (KPIs)
1. `start_to_complete_rate`: % de tasks iniciadas que viram concluidas.
2. `time_to_start`: tempo medio entre criacao e inicio da task.
3. `daily_execution_streak`: dias consecutivos com execucao minima.
4. `abandon_rate`: starts - completes por janela.
5. `post_completion_reward_rate`: % de recompensas resgatadas apos execucao real.
6. `pause_profile`: tempo pausado e retomadas por task (quando houver timer).

## Telemetria minima obrigatoria para novas features
Para cada evento critico, registrar:
- `who`: identificador local do usuario/perfil (quando aplicavel).
- `what`: tipo do evento (ex.: `task_started`, `task_completed`).
- `when`: timestamp local + dia de referencia.
- `context`: categoria, origem da acao, dificuldade, prioridade, energia/percepcao (quando existir).
- `outcome`: resultado (sucesso, abandono, pausa, retomada).

## Regras de priorizacao de backlog
Priorizar features com maior impacto combinado em:
1. aumento de execucao diaria;
2. qualidade de dados comportamentais;
3. reforco psicologico com baixo risco de uso compulsivo.

## Guardrails (nao negociar)
1. Nao gamificar sem lastro de progresso real.
2. Nao introduzir recompensa que incentive evitacao de tarefa importante.
3. Nao criar feature sem eventos minimos para medicao posterior.
4. Nao quebrar compatibilidade de dados historicos.
5. Respeitar diretriz atual: sem novas features de relatorio ate refatoracao dedicada.

## Definition of Ready (DoR) para ST
Uma ST so entra em desenvolvimento se explicitar:
1. qual pilar obrigatorio atende;
2. qual comportamento quer mudar;
3. quais eventos serao registrados;
4. como o resultado sera medido em KPI;
5. quais riscos psicologicos/comportamentais existem.

## Definition of Done (DoD) de produto
Uma ST so e considerada pronta quando:
1. ACs funcionais estao cumpridos;
2. telemetria minima foi implementada/validada;
3. checklist de story foi atualizado;
4. impacto esperado no pilar e KPI foi documentado;
5. quality gates tecnicos (`lint`, `typecheck`, `test`) executados.

## Checklist rapido por agente
PO/PM:
- validar alinhamento com pilar, comportamento alvo e KPI.

Dev:
- implementar regra de negocio + telemetria minima + compatibilidade de dados.

QA:
- testar fluxo funcional e consistencia dos eventos/logs esperados.

## Relatorios e IA (direcao futura)
- Relatorios avancados ficam para fase dedicada posterior (congelamento ativo agora).
- Preparar dados desde ja para IA futura com:
  - eventos consistentes;
  - contexto suficiente;
  - qualidade e rastreabilidade.
