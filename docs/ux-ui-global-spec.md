# TaskPoints PRO - Especificacao Global de Identidade Visual e UX/UI

## Objetivo
Este documento define o padrao oficial de UX/UI para todas as proximas features, secoes e componentes do produto.
Ele deve ser consultado antes de qualquer implementacao visual.

## Escopo
Aplica-se a:
- `index.html`
- `reports.html`
- `styles/main.css`
- `src/ui/*`
- qualquer nova tela, modal, card, formulario ou botao

## Diretriz Principal
Evoluir a interface sem quebrar a identidade existente:
- visual premium, limpo e funcional
- alto contraste e legibilidade
- consistencia de componentes e comportamentos

## Fundamentos de Identidade Visual

### 1) Tipografia
- Fonte base: `Manrope`
- Fonte de destaque: `Sora`
- Evitar introduzir novas familias tipograficas sem necessidade real
- Hierarquia:
  - `h1/h2/h3`: somente com `--font-heading`
  - textos de apoio: `--text-soft`
  - placeholders: `--text-muted`

### 2) Cores e Tokens
Usar apenas variaveis de `:root` e `:root[data-theme="dark"]` em `styles/main.css`.
- Proibido hardcode de cor em novos componentes, salvo excecoes justificadas
- Cores de referencia:
  - primario: `--primary` / `--primary-strong`
  - sucesso: `--success`
  - alerta: `--warning`
  - erro: `--danger`
  - superficie e bordas: `--bg-*`, `--line`, `--line-strong`

### 3) Forma e Espacamento
- Raios oficiais: `--radius-sm/md/lg/xl`
- Espacamentos oficiais: `--space-1` a `--space-8`
- Manter grid e respiro consistente entre secoes

### 4) Elevacao e Profundidade
- Sombras oficiais: `--shadow-soft`, `--shadow-md`, `--shadow-strong`
- Usar sombra de forma moderada para reforcar hierarquia

## Regras de UX por Componente

### 1) Botoes
Padroes:
- Primario: gradiente azul do sistema (mesmo padrao de "Gerenciar habitos")
- Secundario: `bg-soft`, borda `line`, texto padrao
- Perigo: gradiente vermelho padrao (`btn-danger`)

Consistencia obrigatoria:
- Altura minima de clique: `>= 38px` (ideal 42px)
- Peso tipografico consistente (`600+`)
- Mesmo estado hover/focus para botoes de mesma classe

### 2) Formularios
- Inputs/selects com `min-height: 42px`
- Labels e placeholders claros e curtos
- Validacao com mensagem objetiva (sem ambiguidade)
- Campos avancados devem usar divulgacao progressiva (`details/summary`) quando houver risco de poluicao visual

### 3) Cards e Secoes
- Sempre usar borda + raio + sombra do sistema
- Titulos curtos e claros
- Acoes de gestao devem ficar em area previsivel (cabecalho da secao ou footer do bloco)

### 4) Modais
- Estrutura padrao:
  - titulo + botao fechar
  - contexto curto (1 frase)
  - corpo com formularios/listas
  - acoes no rodape
- Em mobile, garantir area de toque e empilhamento de botoes

### 5) Listas CRUD
- Linhas com:
  - informacao principal (`b`)
  - metadado secundario (`span` com `text-soft`)
  - acoes claras (`Renomear`, `Excluir`)
- Evitar excesso de botao primario em mesma linha

## Regras de Densidade Visual
- Evitar "barra de controles" com muitos campos e botoes simultaneos
- Priorizar:
  - fluxo principal visivel
  - opcoes avancadas recolhiveis
- Sempre reduzir ruído cognitivo antes de adicionar novo controle

## Acessibilidade (minimo WCAG AA)
- Contraste adequado em texto e botoes
- Navegacao por teclado preservada
- `aria-label` em botoes iconicos
- Estados `hover`, `focus-visible` e `disabled` claramente distintos

## Microcopy
- Linguagem curta, direta e consistente em PT-BR
- Verbos de acao claros: `Adicionar`, `Salvar`, `Excluir`, `Renomear`, `Fechar`
- Evitar termos tecnicos desnecessarios para usuario final

## Responsividade
- Desktop: preservar layout em grid com hierarquia clara
- Mobile:
  - evitar overflow horizontal
  - empilhar controles quando necessario
  - botoes com largura adequada para toque

## Regras de Implementacao para Novas Features
Antes de implementar UI nova:
1. Reutilizar componente/classe existente quando possivel
2. Se criar variacao, manter tokens e comportamento do padrao
3. Validar impacto visual em `index` e `reports` (coerencia global)
4. Garantir estados: vazio, carregando (quando houver), erro, sucesso

## Checklist de Revisao UX/UI (obrigatorio em PR)
- [ ] Componente segue tokens de cor/espaco/radius/sombra
- [ ] Botoes padronizados (primario/secundario/perigo)
- [ ] Formularios com hierarquia clara e sem poluicao visual
- [ ] Layout responsivo desktop/mobile
- [ ] Acessibilidade minima (foco, contraste, aria)
- [ ] Microcopy consistente em PT-BR
- [ ] Sem hardcode visual desnecessario

## Governanca
- Este e o documento fonte para decisoes de UX/UI.
- Em caso de conflito entre implementacao e este spec, este spec prevalece.
- Mudancas neste arquivo devem ser versionadas junto da feature que motivou a alteracao.
