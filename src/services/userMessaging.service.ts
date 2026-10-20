import { logger } from '../utils/logger.js';

interface DailySummaryData {
  userName?: string;
  remindersToday: string[];
  dailyBudget?: number;
  alreadySpent?: number;
  currency: string;
}

interface RenewalReminderData {
  userName?: string;
  daysRemaining: number;
}

/**
 * Generate personalized daily summary message
 */
export function generateDailySummary(data: DailySummaryData): string {
  const { userName = 'você', remindersToday, dailyBudget, alreadySpent = 0, currency } = data;

  let message = `Bom dia${userName ? `, ${userName}` : ''}! ☀️\n\n`;

  // Reminders section
  if (remindersToday.length > 0) {
    message += `📋 *Seus compromissos para hoje:*\n`;
    remindersToday.forEach((reminder, idx) => {
      message += `${idx + 1}. ${reminder}\n`;
    });
    message += '\n';
  } else {
    message += `📋 *Sem compromissos para hoje*\n\n`;
  }

  // Budget section
  if (dailyBudget !== undefined) {
    const remaining = dailyBudget - alreadySpent;
    const percentUsed = ((alreadySpent / dailyBudget) * 100).toFixed(0);

    message += `💰 *Orçamento de hoje:*\n`;
    message += `Limite: ${currency} ${dailyBudget.toFixed(2)}\n`;
    message += `Já gasto: ${currency} ${alreadySpent.toFixed(2)}\n`;
    message += `Disponível: ${currency} ${Math.max(0, remaining).toFixed(2)}\n`;

    if (remaining > 0) {
      message += `✅ Você pode gastar até ${currency} ${remaining.toFixed(2)} hoje\n`;
    } else {
      message += `⚠️ Você já atingiu seu limite diário\n`;
    }
  } else {
    message += `💰 *Sem limite de gasto definido*\n`;
    message += `Quer definir um teto de gasto diário?\n`;
  }

  message += `\nTenha um ótimo dia! 🌟\n`;
  message += `Estou aqui para ajudar com qualquer coisa. 😊`;

  return message;
}

/**
 * Generate renewal reminder message - 7 days before
 */
export function generateRenewalReminder7Days(data: RenewalReminderData): string {
  const { userName = 'você' } = data;

  return `⏰ *Lembrete de Renovação*\n\n
Olá${userName ? `, ${userName}` : ''}! 👋\n
Seu plano Memo expira em *7 dias*.\n\n
Para não perder todo o contexto histórico das suas despesas,
lembretes e conversas, *renove agora* e continue com seu assistente! 🤖\n\n
*Benefícios de renovar:*
✓ Mantenha todo seu histórico
✓ Continue recebendo resumos diários
✓ Assistente personalizado para suas necessidades
✓ Dicas de economia automáticas\n\n
*[Renovar agora]* ou me avise se tiver dúvidas! 😊`;
}

/**
 * Generate renewal reminder message - 2 days before
 */
export function generateRenewalReminder2Days(data: RenewalReminderData): string {
  const { userName = 'você' } = data;

  return `⏰ *Aviso: Plano vence em 2 dias!*\n\n
Olá${userName ? `, ${userName}` : ''}! ⚠️\n
Seu plano expira em apenas *2 dias*.\n\n
Não perca seu assistente pessoal e todo o histórico de:
📊 Despesas
📋 Lembretes
💬 Conversas com seu assistente\n\n
*Renove agora para continuar:*
✓ Acompanhando seus gastos
✓ Recebendo lembretes automáticos
✓ Sendo ajudado em decisões do dia a dia\n\n
*[Renovar agora]* — leva só 1 minuto! ⚡`;
}

/**
 * Generate renewal reminder message - 1 day before
 */
export function generateRenewalReminder1Day(data: RenewalReminderData): string {
  const { userName = 'você' } = data;

  return `🚨 *ÚLTIMO DIA: Plano vence amanhã!*\n\n
Oi${userName ? `, ${userName}` : ''}! 😱\n
Seu plano Memo vence *amanhã*.\n\n
Se não renovar, você vai perder:
❌ Acesso ao assistente
❌ Todo seu histórico de despesas
❌ Lembretes pendentes
❌ Conversas salvas\n\n
*Renove AGORA para manter tudo:*
✓ Seu assistente pessoal sempre disponível
✓ Histórico completo de transações
✓ Lembretes automáticos
✓ Dicas personalizadas\n\n
*[RENOVAR AGORA]* — ainda há tempo! ⏱️\n\n
Qualquer dúvida, é só chamar! 💬`;
}

/**
 * Generate spending alert message
 */
export function generateSpendingAlert(data: {
  userName?: string;
  spent: number;
  budget: number;
  currency: string;
  percentageUsed: number;
}): string {
  const { userName, spent, budget, currency, percentageUsed } = data;

  let message = `💳 *Alerta de Gasto*\n\n`;
  message += `Oi${userName ? `, ${userName}` : ''}!\n\n`;

  if (percentageUsed >= 100) {
    message += `⚠️ Você já gastou ${currency} ${spent.toFixed(2)}\n`;
    message += `Seu limite diário era ${currency} ${budget.toFixed(2)}\n\n`;
    message += `Você ultrapassou o orçamento! 😅\n`;
    message += `Tente economizar nos próximos dias.\n\n`;
  } else if (percentageUsed >= 80) {
    const remaining = (budget - spent).toFixed(2);
    message += `Você já gastou ${percentageUsed}% do seu orçamento.\n`;
    message += `Você ainda pode gastar ${currency} ${remaining}\n\n`;
    message += `⚠️ Cuidado para não ultrapassar o limite! 💰`;
  }

  message += `\nQuer ajuda a economizar? Posso orientar! 😊`;

  return message;
}

/**
 * Generate task reminder message
 */
export function generateTaskReminder(data: {
  userName?: string;
  taskName: string;
  dueTime: string;
}): string {
  const { userName, taskName, dueTime } = data;

  return `⏰ *Lembrete: ${taskName}*\n\n
Olá${userName ? `, ${userName}` : ''}! 👋\n\n
Você tem pendente:\n
📌 ${taskName}\n\n
⏰ ${dueTime}\n\n
Não esqueça! 😊\n
Precisa de ajuda para algo? Estou aqui! 💬`;
}

/**
 * Generate welcome message for new user
 */
export function generateWelcomeMessage(data: {
  userName?: string;
  daysAvailable: number;
}): string {
  const { userName, daysAvailable } = data;

  return `Bem-vindo${userName ? `, ${userName}` : ''}! 👋\n\n
Sou seu *Assistente Pessoal Memo* pelos próximos *${daysAvailable} dias*.\n\n
🎯 *Vou ajudar você com:*\n
✓ Registrar despesas e acompanhar gastos
✓ Criar lembretes de tarefas e compromissos
✓ Tirar dúvidas práticas
✓ Orientar você em decisões do dia a dia\n\n
📋 *Como me usar:*\n
1️⃣ "Gastei R$ 200 no mercado"
2️⃣ "Lembrar de pagar conta dia 15"
3️⃣ "Como funciona PIX?"
4️⃣ "Me ajuda a economizar?"

Você também receberá um *resumo diário* toda manhã! ☀️\n\n
Pronto para começar? 🚀`;
}

/**
 * Generate re-engagement message for inactive user (48h no interaction)
 */
export function generateReEngagementMessage(data: {
  userName?: string;
  hoursSinceLastInteraction: number;
}): string {
  const { userName = 'você', hoursSinceLastInteraction } = data;

  return `Oi ${userName}! 👋\n\n
Vi que você tá quietinho aí... imagino que esteja bem atarefado, né? 😄\n\n
Só queria lembrar que estou por aqui, *sempre pronto* para ajudar em qualquer coisa:\n\n
💰 Quer registrar um gasto? "Gastei R$ 50 no Uber"
⏰ Precisa de um lembrete? "Lembrar de pagar conta amanhã"
❓ Tem alguma dúvida? "Como faço pra economizar?"
📊 Quer ver seu resumo? "Qual é meu gasto total esse mês?"\n\n
Pode ser sobre *qualquer assunto* — gastos, lembretes, dúvidas sobre finanças, planos... eu tô aqui! 🎯\n\n
*Que tal conversa agora?* 😊`;
}

export const messagingService = {
  generateDailySummary,
  generateRenewalReminder7Days,
  generateRenewalReminder2Days,
  generateRenewalReminder1Day,
  generateReEngagementMessage
};
