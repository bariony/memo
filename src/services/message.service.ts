import { ClaudeService } from './claude.service.js';
import { WhitelistService } from './whitelist.service.js';
import { ExpenseService } from './expense.service.js';
import { ReminderService } from './reminder.service.js';
import { evolution } from './evolution.service.js';
import { getDatabase } from '../config/database.js';
import { assistantService } from './assistant.service.js';
import { detectRestrictionType, getSmartResponse } from '../config/assistantResponses.js';

const FOLLOW_UP = '\n\nPosso ajudar com mais alguma coisa? 😊';

/**
 * Extract a first name from a free-text reply to "qual é o seu nome?".
 * Strips common Portuguese preambles ("meu nome é", "sou o/a", etc) and
 * keeps the first couple of words, title-cased.
 */
function extractName(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^(meu nome é|me chamo|eu sou o|eu sou a|eu sou|sou o|sou a|sou|é)\s+/i, '');

  const words = cleaned.split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) return cleaned.slice(0, 50);

  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .slice(0, 50);
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export class MessageService {
  private claudeService = new ClaudeService();
  private whitelistService = new WhitelistService();
  private expenseService = new ExpenseService();
  private reminderService = new ReminderService();
  private evolutionService = evolution;

  async processMessage(phone: string, messageText: string): Promise<string> {
    try {
      // 1. Validate whitelist
      const access = await this.whitelistService.validateAccess(phone);
      if (!access.authorized) {
        const msg = access.reason === 'expired'
          ? 'Sua licença expirou. Para não perder seu histórico de gastos, fale com Igor para renovar.'
          : 'Você precisa falar com o administrador do sistema: (11) 986683737';

        await this.evolutionService.sendMessage(phone, msg);
        return msg;
      }

      // 2. Ensure user exists, fetch current name state
      const pool = getDatabase();
      await pool.query(
        'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
        [phone]
      );

      const userResult = await pool.query(
        'SELECT name, name_requested_at FROM users WHERE phone_number = $1',
        [phone]
      );
      const user = userResult.rows[0] as { name: string | null; name_requested_at: Date | null };

      // 3. Name collection: ask once, then capture the next reply as the name
      if (!user.name) {
        if (!user.name_requested_at) {
          await pool.query(
            'UPDATE users SET name_requested_at = NOW() WHERE phone_number = $1',
            [phone]
          );
          const msg = 'Oi! 👋 Antes de começar, como posso te chamar?';
          await this.evolutionService.sendMessage(phone, msg);
          return msg;
        }

        const name = extractName(messageText);
        await pool.query('UPDATE users SET name = $1 WHERE phone_number = $2', [name, phone]);

        const msg = `Prazer, ${name}! 😊 Agora sim, vamos lá.${FOLLOW_UP}`;
        await this.evolutionService.sendMessage(phone, msg);
        return msg;
      }

      const userName = user.name;

      // 4. Smart contour: catch out-of-scope requests before hitting Claude,
      // so the user gets a helpful "here's what I CAN do" instead of a flat
      // refusal (and we save an API call).
      const restrictionType = detectRestrictionType(messageText);
      if (restrictionType) {
        const response = getSmartResponse(restrictionType, phone);
        await this.evolutionService.sendMessage(phone, response);
        return response;
      }

      // 5. Build the full assistant personality/system prompt for this user
      const systemPrompt = assistantService.getSystemPrompt({
        phone_number: phone,
        permitted_until: access.permitted_until!,
        status: 'active',
        name: userName,
      });

      // 6. Detect intent
      const intent = await this.claudeService.detectIntent(messageText);

      let response: string;

      if (intent === 'expense_log') {
        const parsed = await this.claudeService.parseExpense(messageText);
        await this.expenseService.logExpense(phone, parsed.amount, parsed.description);
        const today = await this.expenseService.getTodayTotal(phone);

        response = `✓ Anotei: R$${parsed.amount.toFixed(2)} em ${parsed.description}\n`;
        response += `Hoje você já registrou ${today.count} despesa${today.count !== 1 ? 's' : ''}, totalizando R$${today.total.toFixed(2)}.`;
        response += FOLLOW_UP;
      } else if (intent === 'expense_query') {
        const expenses = await this.expenseService.getRecentExpenses(phone, 7);
        response = await this.claudeService.formatExpenseQuery(expenses, messageText);
      } else if (intent === 'reminder_set') {
        try {
          const parsed = await this.claudeService.parseReminder(messageText);
          const scheduledFor = new Date(parsed.scheduledFor);
          await this.reminderService.scheduleReminder(phone, scheduledFor, parsed.message, parsed.isRecurring);

          response = `✓ Lembrete criado: "${parsed.message}"\n`;
          response += `Vou te avisar em ${formatDateTime(scheduledFor)}${parsed.isRecurring ? ', todos os dias neste horário' : ''}.`;
          response += FOLLOW_UP;
        } catch (err) {
          console.error('Reminder parsing failed:', err);
          response = 'Não consegui entender direito a data do lembrete. Pode tentar de novo? Ex: "lembrar de pagar conta amanhã às 10h" 😊';
        }
      } else {
        response = await this.claudeService.answerGeneralQuestion(messageText, systemPrompt);
      }

      // Send response
      await this.evolutionService.sendMessage(phone, response);
      return response;
    } catch (error) {
      console.error('Message processing error:', error);
      const errorMsg = 'Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.';
      try {
        await this.evolutionService.sendMessage(phone, errorMsg);
      } catch (e) {
        console.error('Failed to send error message:', e);
      }
      throw error;
    }
  }
}
