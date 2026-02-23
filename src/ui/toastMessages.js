export const FEEDBACK_TOASTS = {
  penaltyApplied(totalPenalizedPoints) {
    return {
      tone: "warning",
      title: "Penalidade aplicada",
      message: `Total penalizado: ${Number(totalPenalizedPoints) || 0} pts.`,
    };
  },
  categoryCreated(name) {
    return {
      tone: "success",
      title: "Categoria criada",
      message: `Categoria "${name || "Nova categoria"}" adicionada.`,
    };
  },
  templatesSynced(createdCount) {
    const count = Number(createdCount) || 0;
    if (count > 0) {
      return {
        tone: "success",
        title: "Templates sincronizados",
        message: `${count} task(s) adicionada(s) ao dia.`,
      };
    }
    return {
      tone: "info",
      title: "Templates sincronizados",
      message: "Nenhuma task faltante no template.",
    };
  },
  weeklyGoalCreated(payload) {
    return {
      tone: "success",
      title: "Meta semanal criada",
      message: `${payload?.name || "Meta"}: alvo ${Number(payload?.targetPoints) || 0} pts, recompensa ${Number(payload?.rewardPoints) || 0} pts.`,
    };
  },
  backupExported(fileName) {
    return {
      tone: "success",
      title: "Backup exportado",
      message: `Arquivo ${fileName} gerado.`,
    };
  },
  backupImported(collectionsCount) {
    return {
      tone: "success",
      title: "Backup importado",
      message: `${Number(collectionsCount) || 0} colecao(oes) restaurada(s).`,
    };
  },
  defaultTemplateAdded(name) {
    return {
      tone: "success",
      title: "Template adicionado",
      message: `"${name || "Template"}" entrou na lista de templates.`,
    };
  },
  defaultTemplatesSaved(count) {
    return {
      tone: "success",
      title: "Templates salvos",
      message: `${Number(count) || 0} template(s) ativo(s).`,
    };
  },
  daySelected(dayLabel) {
    return {
      tone: "info",
      title: "Dia selecionado",
      message: `Dia ${dayLabel} ja existia e foi aberto.`,
    };
  },
  dayCreated(dayLabel, taskCount) {
    return {
      tone: "success",
      title: "Dia criado",
      message: `${dayLabel} criado com ${Number(taskCount) || 0} task(s) inicial(is).`,
    };
  },
  taskCreated(name, points) {
    return {
      tone: "success",
      title: "Tarefa criada",
      message: `"${name || "Task"}" (+${Number(points) || 0} pts).`,
    };
  },
  taskCompleted(name, points) {
    return {
      tone: "success",
      title: "Tarefa concluida",
      message: `"${name || "Task"}" (+${Number(points) || 0} pts).`,
    };
  },
  taskReopened(name) {
    return {
      tone: "info",
      title: "Tarefa reaberta",
      message: `"${name || "Task"}" marcada como pendente.`,
    };
  },
  taskCategoryChanged(label) {
    return {
      tone: "info",
      title: "Categoria alterada",
      message: `Task movida para ${label || "categoria selecionada"}.`,
    };
  },
  taskStarted(name) {
    return {
      tone: "info",
      title: "Tarefa iniciada",
      message: `"${name || "Task"}" iniciada.`,
    };
  },
  taskTimerPaused() {
    return {
      tone: "info",
      title: "Cronometro pausado",
      message: "A contagem da tarefa foi pausada.",
    };
  },
  taskTimerResumed() {
    return {
      tone: "success",
      title: "Cronometro retomado",
      message: "A contagem da tarefa voltou a correr.",
    };
  },
  taskDeleted(name) {
    return {
      tone: "warning",
      title: "Tarefa removida",
      message: `"${name || "Task"}" foi excluida.`,
    };
  },
  rewardCreated(name, cost) {
    return {
      tone: "success",
      title: "Recompensa criada",
      message: `"${name || "Recompensa"}" custo base ${Number(cost) || 0} pts.`,
    };
  },
  rewardRedeemed(name, cost, sourceLabel) {
    return {
      tone: "success",
      title: "Recompensa resgatada",
      message: `"${name || "Recompensa"}" resgatada. Custo: ${Number(cost) || 0} pts (${sourceLabel || "pontos do dia"}).`,
    };
  },
  rewardDeleted(name) {
    return {
      tone: "warning",
      title: "Recompensa removida",
      message: `"${name || "Recompensa"}" excluida.`,
    };
  },
  habitCreated(name) {
    return {
      tone: "success",
      title: "Habito criado",
      message: `"${name || "Habito"}" adicionado ao catalogo.`,
    };
  },
  habitUpdated(name) {
    return {
      tone: "success",
      title: "Habito atualizado",
      message: `"${name || "Habito"}" atualizado com sucesso.`,
    };
  },
  habitExecuted(name, pointsDelta) {
    return {
      tone: "success",
      title: "Habito registrado",
      message: `"${name || "Habito"}" (+${Number(pointsDelta) || 0} pts).`,
    };
  },
  habitDeleted(name) {
    return {
      tone: "warning",
      title: "Habito removido",
      message: `"${name || "Habito"}" excluido do catalogo.`,
    };
  },
  habitUndo(points) {
    return {
      tone: "info",
      title: "Registro desfeito",
      message: `Execucao removida (${Math.abs(Number(points) || 0)} pts).`,
    };
  },
  categoryRenamed(previousLabel, nextName) {
    return {
      tone: "success",
      title: "Categoria renomeada",
      message: `"${previousLabel || "Categoria"}" agora e "${nextName || "novo nome"}".`,
    };
  },
  categoryDeleted(label) {
    return {
      tone: "warning",
      title: "Categoria removida",
      message: `"${label || "Categoria"}" removida e itens movidos para Trabalho.`,
    };
  },
  dayDeleted(dayLabel) {
    return {
      tone: "warning",
      title: "Dia removido",
      message: `Dia ${dayLabel} excluido com sucesso.`,
    };
  },
};
