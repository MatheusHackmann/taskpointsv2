# ST-004 - Objetivos por Categoria

## Status
Implementacao concluida.
Prontidao: **DONE** (fechada em 2026-02-21 apos gate QA PASS, checklist PO completo e README atualizado).
Observacao: em 2026-02-21 o escopo foi atualizado para **manter CRUD de categorias** por decisao de produto; o gate QA anterior deve ser reemitido considerando este requisito.
Diretriz ativa (2026-02-21): congelamento de relatorios para STs atuais e futuras; nao abrir novas tarefas de relatorio nesta story.
Aplicacao desta diretriz: quaisquer itens historicos de QA/checklist que mencionem relatorio passam a ser considerados **adiados**.

## User Story
Como usuario do TaskPoints PRO, quero classificar tarefas e habitos por categoria para acompanhar meu desempenho por area da vida e ajustar minhas prioridades.

## Objetivo
Adicionar categorizacao funcional para tarefas e habitos com categorias padrao (`saude`, `trabalho`, `estudo`) e gerenciamento via CRUD, com visibilidade no dashboard.

## Alinhamento com Product One-Pager

- Pilar principal: `Mapeamento comportamental`.
- Pilar secundario: `Execucao diaria`.
- Comportamento-alvo: organizar rotina por area de vida para facilitar priorizacao e conclusao.
- KPI primario impactado: `start_to_complete_rate` por categoria.
- KPI secundario impactado: `% de dias com uso no periodo` por categoria.

## Telemetria minima desta ST

Eventos obrigatorios:
- `category_selected_on_task`
- `category_selected_on_habit`
- `category_created`
- `category_renamed`
- `category_deleted_with_fallback`

Campos minimos por evento:
- `what`: tipo do evento.
- `when`: timestamp local + `day`.
- `context`: categoria origem/destino, entidade afetada (`task`/`habit`), origem da acao.
- `outcome`: sucesso/falha + total de itens migrados em acoes de fallback.

## Guardrails de produto

- Nao permitir perda de vinculo categorico em migracoes/CRUD.
- Garantir fallback seguro para dados legados.
- Nao criar alteracoes novas no modulo de relatorios nesta fase.

## Escopo

Inclui:
- Definicao de categoria em task template, tarefa e habito.
- Categorias padrao: `saude`, `trabalho`, `estudo`.
- CRUD de categorias (adicionar, renomear, excluir com regra de fallback).
- Persistencia da categoria em IndexedDB.
- Exibicao de resumo por categoria no dashboard.

Nao inclui:
- Metas por categoria (fica para fase futura).
- Recomendacoes inteligentes por categoria.
- Novas alteracoes no modulo de relatorios (congelado nesta fase).

## Criterios de aceite

1. Usuario consegue selecionar categoria ao criar/editar tarefas e habitos.
2. Sistema salva categoria nos registros e mantem dado apos reload.
3. Registros sem categoria antiga recebem fallback consistente (`trabalho`) sem quebrar UI.
4. Dashboard exibe pontos e conclusoes por categoria no periodo.
5. Nao ha alteracoes novas de relatorio nesta ST.
6. Estado vazio e mensagem clara sao exibidos quando nao houver dados na categoria.
7. Usuario consegue adicionar nova categoria com chave canonica valida.
8. Usuario consegue renomear categoria e o sistema propaga a mudanca para tasks/habitos/eventos relacionados.
9. Usuario consegue excluir categoria customizada definindo categoria de substituicao para manter consistencia historica.
10. Categoria default `trabalho` nao pode ser excluida.

## Regras de negocio

1. Categorias padrao iniciais: `saude`, `trabalho`, `estudo`.
2. Categoria e obrigatoria para novos registros de tarefa e habito.
3. Migracao de legado: se categoria ausente, considerar `trabalho`.
4. Agregacoes por categoria usam apenas dados dentro da janela de periodo ativa.
5. IDs/textos de categoria devem usar chave canonica (lowercase, sem espacos e sem acentos).
6. Categoria default para dados legados: `trabalho`.
7. Categoria `trabalho` e obrigatoria no sistema e nao pode ser removida.
8. Exclusao de categoria customizada exige categoria de substituicao valida para migrar referencias.

## Dependencias

- ST-003 concluida e estavel (base de relatorios e metas semanais ja existente).
- Estrutura atual de IndexedDB em `DB_VERSION = 3` com stores `tasks` e `habitTemplates`.
- Logs e relatorios existentes devem permanecer retrocompativeis.

## Plano tecnico

1. Dominio e constantes:
- Adicionar enumeracao de categorias em `src/app/constants.js`.
- Criar helper de validacao/canonicalizacao em `src/domain/categories.js`.

2. Persistencia e migracao:
- Subir `DB_VERSION` para `3`.
- Atualizar `src/storage/schema.js` com indices para consulta por categoria:
  - `tasks`: index `by_day_category` => `["day", "category"]`
  - `habitTemplates`: index `by_category_name` => `["category", "name"]`
- Atualizar `src/storage/migrations.js` para normalizar legado:
  - `tasks.category` ausente -> `trabalho`
  - `habitTemplates.category` ausente -> `trabalho`
- Aplicar fallback defensivo em runtime via helper unico (`normalizeCategory`) para evitar quebra de UI em dados importados antigos.

3. UI de cadastro/edicao:
- Incluir seletor de categoria em formularios de tarefa e habito.
- Garantir validacao de obrigatoriedade no submit.
- Exibir badge/categoria nos cards relevantes para verificacao visual rapida.

4. Relatorios:
- Adiado por diretriz de produto; nao implementar alteracoes nesta ST.

5. Observabilidade:
- Registrar eventos de criacao/edicao com `category` em payload de log.

6. Compatibilidade:
- Garantir que backup/import continue funcionando com e sem `category` em payload antigo.

## Riscos

- Inconsistencia entre categoria salva em templates e tarefas derivadas.
- Quebra de registros antigos sem categoria.
- Divergencia de agregacao entre modulos.

## Mitigacoes

- Centralizar normalizacao de categoria em helper unico.
- Executar fallback de legado em um unico ponto de leitura.
- Reutilizar funcao de agregacao por categoria nos contextos de leitura necessarios.

## Checklist

- [x] Constantes e helper de categoria implementados
- [x] Migracao DB v3 (schema + dados legados) implementada
- [x] Persistencia de categoria em tarefas e habitos implementada
- [x] Formularios com seletor de categoria implementados
- [x] Badge/visibilidade de categoria no dashboard implementada
- [x] Resumo por categoria no dashboard implementado
- [x] Logs com categoria implementados
- [x] Compatibilidade de backup/import validada (fluxo de import + migracao + fallback revisado)
- [x] CRUD de categorias implementado (adicionar, renomear, excluir com fallback)
- [x] Teste automatizado de normalizacao de categoria (quando aplicavel)
- [x] Teste manual: validar CRUD de categorias + resumo por categoria no dashboard
- [x] Documentacao atualizada no README (se necessario)

## Evidencias de validacao

- Quality gates executados com sucesso:
  - `npm.cmd run lint` (sem erros; warnings preexistentes em `.aios-core`)
  - `npm.cmd run typecheck`
  - `npm.cmd test` (`238 passed`)
- Compatibilidade backup/import revisada:
  - `src/domain/backup.js` importa payload sem exigir campo `category`;
  - `src/storage/migrations.js` normaliza categorias legadas em `tasks` e `habitTemplates`;
  - leitura em runtime aplica fallback defensivo via `normalizeCategory`.
- Validacao operacional:
  - validacao manual em browser confirmada para UX de ponta a ponta do CRUD e dos filtros de categoria.
- Evidencia manual registrada (2026-02-21):
  - CRUD validado: adicionar, renomear e excluir categoria customizada com substituicao.
  - Regra de protecao validada: categoria default `trabalho` nao pode ser excluida.
  - Persistencia validada apos reload para tarefas/habitos com categoria.
  - Relatorios validados com filtro por categoria e estado vazio quando sem dados.
  - Fallback legado validado para registros sem `category`, aplicando `trabalho` sem quebra de UI.

## File list

- `docs/stories/ST-004-objetivos-por-categoria.md`
- `src/app/constants.js`
- `src/domain/categories.js`
- `src/domain/defaults.js`
- `src/domain/logs.js`
- `src/domain/tasks.js`
- `src/domain/habits.js`
- `src/storage/schema.js`
- `src/storage/migrations.js`
- `src/ui/events.js`
- `src/ui/render.js`
- `index.html`
- `styles/main.css`
- `.aios-core/core/__tests__/st004-categories-normalization.test.js`

## QA Results

### Review Date: 2026-02-21

### Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

A implementacao cobre persistencia, migracao e visualizacao por categoria, mas houve desvio de escopo funcional: a ST-004 define conjunto fechado (`saude`, `trabalho`, `estudo`) e explicita que categorias customizadas nao fazem parte desta entrega. O codigo atual habilita CRUD de categorias customizadas.
CodeRabbit pre-review nao foi executado neste ambiente porque o WSL nao esta instalado.

### Refactoring Performed

Nenhuma alteracao de codigo de produto foi executada nesta revisao.

### Compliance Check

- Coding Standards: ✓ (sem erros de lint; warnings preexistentes em `.aios-core`)
- Project Structure: ✓
- Testing Strategy: ✗ (nao ha teste automatizado cobrindo normalizacao/fallback de categoria)
- All ACs Met: ✗ (desvio de regra de negocio/escopo sobre categorias validas)

### Improvements Checklist

- [ ] Remover CRUD de categorias customizadas da UI e dominio nesta story
- [ ] Restringir validacao para aceitar apenas `saude`, `trabalho`, `estudo`
- [ ] Adicionar teste automatizado para normalizacao/fallback legado de categoria
- [~] Adiado por congelamento de relatorios (2026-02-21)

### Security Review

Nao foram encontrados problemas criticos de seguranca nesta revisao.

### Performance Considerations

Sem regressao relevante observada por analise estatica. Necessario validar performance em uso real apos ajuste de escopo.

### Files Modified During Review

- `docs/stories/ST-004-objetivos-por-categoria.md`
- `docs/qa/gates/ST-004-objetivos-por-categoria.yml`
- `docs/qa/assessments/ST-004-risk-20260221.md`
- `docs/qa/assessments/ST-004-nfr-20260221.md`

### Gate Status

Gate: **FAIL** -> `docs/qa/gates/ST-004-objetivos-por-categoria.yml`  
Risk profile: `docs/qa/assessments/ST-004-risk-20260221.md`  
NFR assessment: `docs/qa/assessments/ST-004-nfr-20260221.md`

### Recommended Status

[✗ Changes Required - See unchecked items above]

### Addendum: Scope Rebaseline (2026-02-21)

Por decisao de produto, a ST-004 passa a incluir CRUD de categorias. O apontamento de desvio de escopo desta revisao (remocao de CRUD) fica desatualizado e deve ser desconsiderado na proxima rodada de gate.
Itens pendentes que permanecem validos: teste automatizado de normalizacao/fallback, teste manual ponta a ponta e atualizacao de documentacao quando aplicavel.

---

### Review Date: 2026-02-21 (Re-review apos rebaseline de escopo)

### Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

Com o requisito atualizado para manter CRUD de categorias, a implementacao está alinhada aos ACs funcionais (selecao, persistencia, fallback legado, filtro/agregacao em relatorios e operacoes de adicionar/renomear/excluir com protecao da categoria default).
Pendencias restantes sao de evidencia de qualidade (teste automatizado especifico e validacao manual ponta a ponta).
CodeRabbit pre-review nao foi executado neste ambiente porque o WSL nao esta instalado.

### Refactoring Performed

Nenhuma alteracao de codigo de produto foi executada nesta revisao.

### Compliance Check

- Coding Standards: ✓ (sem erros; warnings preexistentes em `.aios-core`)
- Project Structure: ✓
- Testing Strategy: ✗ (falta teste automatizado dedicado para normalizacao/fallback de categoria)
- All ACs Met: ✓ (considerando o escopo rebaselined com CRUD)

### Improvements Checklist

- [ ] Adicionar teste automatizado para normalizacao/fallback legado de categoria
- [~] Adiado por congelamento de relatorios (2026-02-21)
- [ ] Atualizar README/documentacao de uso de categorias (se aplicavel)

### Security Review

Nao foram encontrados problemas criticos de seguranca nesta revisao.

### Performance Considerations

Sem regressao relevante observada por analise estatica.

### Files Modified During Review

- `docs/stories/ST-004-objetivos-por-categoria.md`
- `docs/qa/gates/ST-004-objetivos-por-categoria.yml`
- `docs/qa/assessments/ST-004-risk-20260221.md`
- `docs/qa/assessments/ST-004-nfr-20260221.md`

### Gate Status

Gate: **CONCERNS** -> `docs/qa/gates/ST-004-objetivos-por-categoria.yml`  
Risk profile: `docs/qa/assessments/ST-004-risk-20260221.md`  
NFR assessment: `docs/qa/assessments/ST-004-nfr-20260221.md`

### Recommended Status

[✗ Changes Required - evidencias de teste pendentes]

---

### Review Date: 2026-02-21 (Final re-review)

### Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

Com o escopo rebaselined (CRUD de categorias), a implementacao esta consistente com os criterios de aceite e regras de negocio da story. Evidencias automatizadas e manuais foram registradas.
CodeRabbit pre-review nao foi executado neste ambiente porque o WSL nao esta instalado.

### Refactoring Performed

Nenhuma alteracao de codigo de produto foi executada nesta revisao.

### Compliance Check

- Coding Standards: ✓ (sem erros; warnings preexistentes em `.aios-core`)
- Project Structure: ✓
- Testing Strategy: ✓ (teste automatizado de normalizacao/fallback adicionado)
- All ACs Met: ✓

### Improvements Checklist

- [x] Adicionar teste automatizado para normalizacao/fallback legado de categoria
- [x] Evidencia historica mantida (antes do congelamento de relatorios)
- [ ] Opcional: atualizar README/documentacao de uso de categorias customizadas

### Security Review

Nao foram encontrados problemas criticos de seguranca nesta revisao.

### Performance Considerations

Sem regressao relevante observada por analise estatica nesta rodada.

### Files Modified During Review

- `docs/stories/ST-004-objetivos-por-categoria.md`
- `docs/qa/gates/ST-004-objetivos-por-categoria.yml`
- `docs/qa/assessments/ST-004-risk-20260221.md`
- `docs/qa/assessments/ST-004-nfr-20260221.md`

### Gate Status

Gate: **PASS** -> `docs/qa/gates/ST-004-objetivos-por-categoria.yml`  
Risk profile: `docs/qa/assessments/ST-004-risk-20260221.md`  
NFR assessment: `docs/qa/assessments/ST-004-nfr-20260221.md`

### Recommended Status

[✓ Ready for Done]

---

### Review Date: 2026-02-21 (Post-README re-review)

### Reviewed By: Quinn (Test Architect)

### Code Quality Assessment

Implementacao e evidencias seguem consistentes com o escopo aprovado da ST-004. O README foi atualizado para refletir corretamente CRUD de categorias, filtro/resumo por categoria e comportamento de fallback legado.
CodeRabbit pre-review nao foi executado neste ambiente porque o WSL nao esta instalado.

### Refactoring Performed

Nenhuma alteracao de codigo de produto foi executada nesta revisao.

### Compliance Check

- Coding Standards: ? (sem erros; warnings preexistentes em `.aios-core`)
- Project Structure: ?
- Testing Strategy: ? (`241` testes passando, incluindo `st004-categories-normalization.test.js`)
- All ACs Met: ?

### Improvements Checklist

- [x] Cobertura automatizada de normalizacao/fallback validada
- [x] Evidencia manual historica mantida (antes do congelamento de relatorios)
- [ ] Alinhar rastreabilidade: marcar checklist de documentacao da story como concluido

### Security Review

Sem novos achados de seguranca nesta rodada.

### Performance Considerations

Sem regressao observada por analise estatica e testes executados.

### Files Modified During Review

- `docs/stories/ST-004-objetivos-por-categoria.md`
- `docs/qa/gates/ST-004-objetivos-por-categoria.yml`

### Gate Status

Gate: **PASS** -> `docs/qa/gates/ST-004-objetivos-por-categoria.yml`

### Recommended Status

[Ready for Done]

