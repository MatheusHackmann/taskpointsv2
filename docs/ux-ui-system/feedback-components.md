# Feedback Components (Dialogos, Alerts e Toasts)

Este documento padroniza o sistema de feedback da interface para substituir `alert()` e `confirm()`.

## Componentes Oficiais

Arquivos fonte:
- `src/ui/feedback.js`
- `src/ui/toastMessages.js`

APIs publicas:
- `showSystemAlert(options)`
- `showSystemConfirm(options)`
- `showActionToast(options)`

Catalogo de mensagens:
- `FEEDBACK_TOASTS` em `src/ui/toastMessages.js`

## Tons Visuais (tone)

Tons aceitos:
- `info`: orientacoes gerais e mensagens neutras
- `success`: confirmacao de sucesso
- `warning`: acoes de risco/atencao
- `danger`: erro/falha/remocao critica

## Padroes de Uso

### 1) Alert informativo

```js
showSystemAlert({
  tone: "info",
  title: "Informacao",
  message: "Mensagem para orientar a pessoa usuaria.",
});
```

### 2) Confirmacao de acao

```js
const ok = await showSystemConfirm({
  tone: "warning",
  title: "Confirmar acao",
  message: "Deseja continuar?",
  confirmLabel: "Confirmar",
  cancelLabel: "Cancelar",
});

if (!ok) return;
```

### 3) Toast de acao (canto inferior direito)

```js
showActionToast({
  tone: "success",
  title: "Cadastro concluido",
  message: "Item criado com sucesso.",
});
```

### 4) Toast via catalogo oficial

```js
import { FEEDBACK_TOASTS } from "./toastMessages.js";

const toast = FEEDBACK_TOASTS.rewardRedeemed("Recompensa X", 30, "pontos do dia");
showActionToast(toast);
```

## Mapa de Acoes Padrao

Eventos ja mapeados no catalogo:
- Tarefas: criar, concluir, reabrir, iniciar, trocar categoria, remover
- Recompensas: criar, resgatar, remover
- Habitos: criar, atualizar, registrar, desfazer registro, remover
- Categorias: criar, renomear, remover
- Templates: adicionar, salvar, sincronizar
- Dias: selecionar existente, criar, remover
- Meta semanal: criar
- Backup: exportar, importar
- Penalidade maxima: aplicada

## Diretrizes de Implementacao

1. Nao usar `window.alert()` e `window.confirm()` em features novas.
2. Erros de regra/execucao devem usar `tone: "danger"`.
3. Confirmacoes destrutivas devem usar `showSystemConfirm` com `tone: "warning"`.
4. Acoes concluidas devem disparar toast pelo catalogo (`FEEDBACK_TOASTS`).
5. Evitar strings inline de toast em handlers; centralizar no catalogo.
6. Mensagens devem ser curtas, claras e orientadas a acao.

## Onde ja esta aplicado

- `src/ui/events.js`
- `src/main.js`
