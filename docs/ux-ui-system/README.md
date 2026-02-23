# UX/UI System Handbook

Este diretório centraliza o padrão visual e comportamental de UX/UI do TaskPoints.

Objetivo:
- Ser a fonte única para qualquer agente/equipe antes de implementar nova feature.
- Garantir consistência visual, acessibilidade e reaproveitamento de componentes.

Arquivos:
- `docs/ux-ui-system/feedback-components.md`: padrão oficial de diálogos, alerts e toasts.
- `src/ui/toastMessages.js`: catálogo central de mensagens de toast por evento de UI.
- `docs/ux-ui-global-spec.md`: especificação global de UI já existente no projeto.

Regra de uso para novas features:
1. Ler `docs/ux-ui-global-spec.md`.
2. Ler `docs/ux-ui-system/feedback-components.md`.
3. Reutilizar componentes existentes antes de criar novos.
4. Manter telemetria e rastreabilidade dos eventos de UI quando aplicável.
