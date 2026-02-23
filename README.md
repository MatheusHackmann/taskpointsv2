# TaskPoints PRO

Sistema web para gestao diaria de tarefas, habitos, pontos e recompensas, com trilha de eventos e modulo de relatorios comportamentais.

## 1) O que e o sistema

O TaskPoints PRO transforma a rotina diaria em um fluxo de execucao orientado a pontos:

- Voce cria/seleciona um dia.
- Executa tarefas e habitos.
- Ganha pontos por progresso.
- Resgata recompensas com os pontos do dia.
- Analisa sua performance em relatorios (tempo, consistencia, ranking e insights).

Todo o estado fica no navegador via IndexedDB (sem backend no estado atual).

## 2) Principais funcionalidades

### Painel diario (`index.html`)

- Gestao de dias:
- Criar dia por data.
- Selecionar entre os ultimos dias no carrossel.
- Ver todos os dias em modal.
- Excluir apenas dias futuros (com exclusao em cascata de tasks/eventos/execucoes do dia).

- Tarefas:
- Criar task com nome + categoria.
- Separacao em pendentes e concluidas.
- Iniciar task manualmente (registra horario de inicio).
- Concluir/desconcluir task (soma/remove pontos do dia).
- Auto-start ao concluir sem ter iniciado (para manter metricas coerentes).
- Excluir task (com ajuste de pontos quando necessario).
- Reordenar tasks via drag-and-drop.
- Troca rapida de categoria no card da task (cicla pelas categorias disponiveis).
- Barra de progresso (% concluido) com celebracao quando chega a 100%.

- Templates de tasks para novos dias:
- Modal para editar lista padrao de tarefas.
- Novos dias sao criados automaticamente com base nesses templates.

- Habitos:
- Catalogo de habitos (nome, unidade, incremento, pontos por clique, icone, meta diaria).
- Criar, editar e excluir habito.
- Definir categoria no cadastro/edicao do habito.
- Cards de "registro rapido" na tela principal.
- Registro de execucao no dia (incrementa valor e pontos).
- Desfazer execucao (soft delete + estorno de pontos).
- Acumulados diarios por habito (execucoes, valor total e pontos).

- Categorias (CRUD):
- Categorias padrao iniciais: `saude`, `trabalho`, `estudo`.
- Adicionar categoria customizada (chave canonica).
- Renomear categoria com propagacao para tarefas, habitos, eventos e templates padrao.
- Excluir categoria customizada com categoria de substituicao.
- A categoria default `trabalho` e obrigatoria e nao pode ser removida.

- Recompensas:
- Catalogo global de recompensas com custo em pontos.
- Criar e excluir recompensa.
- Resgatar recompensa sem remover do catalogo.
- Controle de saldo de pontos do dia para permitir/bloquear resgate.
- Lista de recompensas resgatadas no dia.
- Badge indicando quantas recompensas estao disponiveis no momento.

- Logs do dia:
- Modal com historico de eventos do dia (acoes de tarefas, habitos, recompensas etc.).

- Backup e restore:
- Exportacao completa dos dados locais para arquivo JSON.
- Importacao de backup com validacao de estrutura e versao.

- Metas semanais:
- Definicao de meta semanal de pontos.
- Presets de niveis semanais com nomes motivadores.
- Bonus de pontos ao superar niveis da semana.
- Saldo acumulado permanente desses bonus para gastar em qualquer dia.
- Acompanhamento de progresso semanal no dashboard.
- Snapshot de status da meta semanal em relatorios.

- UX adicional:
- Tema claro/escuro com persistencia em `localStorage`.
- Efeitos sonoros para sucesso/conquista.
- Confete em acoes de recompensa e progresso completo.

### Relatorios (`reports.html`)

- Filtros de periodo:
- Hoje.
- Ultimos 7 dias.
- Ultimos 30 dias.
- Intervalo personalizado.

- Blocos analiticos:
- Visao geral: pontos ganhos/gastos, media diaria, taxa de conclusao, melhor/pior dia etc.
- Consistencia: streak atual/maior streak, dias zerados, variacao vs periodo anterior.
- Tempo e produtividade: duracao media, distribuicao por faixas, horarios de conclusao/abandono.
- Ranking inteligente: por pontos, frequencia, duracao media e abandono.
- Insights automaticos com regras baseadas em comportamento no periodo.
- Estatisticas de habitos.
- Fluxo de recompensas e consumo de pontos.
- Resumo por categoria e filtro por categoria no periodo (com estado vazio quando nao houver dados).

### Lembretes de habito

- Loop de verificacao periodica (a cada minuto).
- Para habitos com meta diaria nao atingida:
- exibe toast visual,
- toca lembrete sonoro,
- tenta enviar notificacao do sistema (se permissao estiver concedida),
- respeita janela de repeticao por habito (1 hora).

## 3) Como os pontos funcionam

- `task.complete`: soma pontos da task ao dia.
- `task.uncomplete`: remove os pontos da task.
- `habit.execute`: soma pontos do habito.
- `habit.undo`: estorna pontos daquela execucao.
- `reward.redeem`: subtrai custo da recompensa.

Saldo do dia = ganhos por tarefas/habitos - gastos com recompensas.

## 4) Persistencia de dados

Banco local: IndexedDB (`taskpoints_db`, versao 3).

Object stores atuais:

- `meta`
- `days`
- `tasks`
- `rewards`
- `events`
- `habitTemplates`
- `habitExecutions`

O sistema tambem executa migracoes app-level no bootstrap para garantir metadados basicos e compatibilidade.
Na migracao atual, registros legados sem `category` recebem fallback para `trabalho`.

## 5) Arquitetura do projeto

Estrutura principal:

- `index.html`: painel principal.
- `reports.html`: pagina de relatorios.
- `src/main.js`: bootstrap do app.
- `src/reports.js`: bootstrap/render da pagina de relatorios.
- `src/domain/`: regras de negocio.
- `src/storage/`: camada de persistencia e repositorios IndexedDB.
- `src/ui/`: renderizacao e eventos da interface.
- `styles/main.css`: estilo principal.

Padrao de fluxo:

- UI dispara acao -> Domain valida e aplica regra -> Repositorio persiste no IndexedDB -> Log de evento e gravado -> UI re-renderiza.

## 6) Relatorio tecnico do estado atual

### O que ja esta consolidado

- App funcional sem backend.
- Base de dados local com schema e migracao.
- Gestao completa de tarefas, habitos e recompensas.
- Auditoria por eventos (event sourcing simplificado para analitica).
- Modulo de relatorios com metricas avancadas.
- Interface responsiva para desktop e mobile.

### Regras de negocio relevantes implementadas

- Dia futuro pode ser criado, mas nao gera log de criacao.
- Somente dia futuro pode ser excluido na UI de "Ver todos".
- Excluir task concluida ajusta pontuacao do dia.
- Desfazer execucao de habito e soft delete (mantem historico).
- Resgate de recompensa valida saldo antes de debitar.

### Limites atuais (importante para evolucoes futuras)

- Sem autenticacao e sem sincronizacao em nuvem.
- Dados dependem do navegador/dispositivo atual.
- Sem backend/API para multiusuario.
- Sem suite de testes especifica do produto neste repositorio (scripts delegam para `.aios-core`).
- Alguns textos no codigo estao sem padronizacao de acentuacao/encoding.

## 7) Setup e execucao

Pre-requisitos:

- Node.js >= 18
- npm >= 9

Comandos de qualidade disponiveis:

```bash
npm run lint
npm run typecheck
npm test
```

Execucao da interface:

- Abrir `index.html` no navegador.
- Para relatorios, abrir `reports.html` ou usar o botao de relatorios no painel.

Opcional (dados de exemplo para relatorios):

- Abrir com query string `?seedReports=1` para popular os ultimos 7 dias com dados de teste.

## 8) Guia rapido para evolucao futura

Para evoluir features com seguranca, priorize:

- Novas regras no `domain/`.
- Persistencia e indices no `storage/schema.js` + repositorios.
- Telemetria de comportamento no `events`/`logs` (para manter relatorios coerentes).
- Ajustes visuais no `ui/render.js` + `styles/main.css`.
- Novas metricas centralizadas em `src/domain/reports.js`.

## 9) Resumo executivo

TaskPoints PRO ja entrega um ciclo completo de produtividade gamificada:

- planejamento diario,
- execucao com rastreabilidade,
- reforco comportamental por recompensas,
- e inteligencia de relatorios para melhoria continua.

Esse README pode ser usado como base de referencia para backlog, refatoracoes e implementacoes futuras sem perder o contexto funcional atual do sistema.
