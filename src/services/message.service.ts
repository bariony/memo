import { ClaudeService, ConversationTurn } from './claude.service.js';
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

/** Appends the follow-up question unless the response already ends with one. */
function withFollowUp(response: string): string {
  return response.trim().endsWith('?') ? response : response + FOLLOW_UP;
}

export class MessageService {
  private claudeService = new ClaudeService();
  private whitelistService = new WhitelistService();
  private expenseService = new ExpenseService();
  private reminderService = new ReminderService();
  private evolutionService = evolution;

  private async logMessage(
    phone: string,
    messageText: string,
    intent: string | null,
    responseText?: string
  ): Promise<void> {
    try {
      const pool = getDatabase();
      await pool.query(
        'INSERT INTO message_logs (phone_number, message_text, intent, response_text) VALUES ($1, $2, $3, $4)',
        [phone, messageText, intent, responseText ?? null]
      );
    } catch (err) {
      console.error('Failed to log message:', err);
    }
  }

  /**
   * Last few turns of this conversation, oldest first, so Claude actually
   * has short-term memory instead of treating every message as the first
   * one ever sent - which is what made follow-up questions ("e sobre o que
   * eu perguntei antes?") get answered with a blank restart of the pitch.
   */
  private async getRecentHistory(phone: string, limit: number = 6): Promise<ConversationTurn[]> {
    try {
      const pool = getDatabase();
      const result = await pool.query(
        `SELECT message_text, response_text FROM message_logs
         WHERE phone_number = $1 AND response_text IS NOT NULL
         ORDER BY created_at DESC LIMIT $2`,
        [phone, limit]
      );

      const turns: ConversationTurn[] = [];
      for (const row of result.rows.reverse()) {
        turns.push({ role: 'user', content: row.message_text });
        turns.push({ role: 'assistant', content: row.response_text });
      }
      return turns;
    } catch (err) {
      console.error('Failed to load conversation history:', err);
      return [];
    }
  }

  async processMessage(phone: string, messageText: string): Promise<string> {
    try {
      // 1. Validate whitelist
      const access = await this.whitelistService.validateAccess(phone);
      if (!access.authorized) {
        const msg = access.reason === 'expired'
          ? 'Oi! 👋 Eu sou o Memo, seu assistente pessoal.\n\nVi que seu acesso expirou. Para continuar comigo e não perder seu histórico de gastos e lembretes, fala com o Igor para renovar: 📞 11 98668-3737\n\nAssim que renovar, volto a te ajudar! 😊'
          : access.reason === 'revoked'
          ? 'Oi! 👋 Eu sou o Memo, seu assistente pessoal.\n\nSeu acesso foi desativado por aqui. Se quiser voltar a usar, fala com o Igor: 📞 11 98668-3737 😊'
          : 'Oi! 👋 Eu sou o Memo, seu assistente pessoal.\n\nVi que você ainda não tem acesso liberado por aqui. Gostaria de ter acesso? É só falar com o Igor: 📞 11 98668-3737 😊';

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

          const greeting = assistantService.getGreetingMessage({
            phone_number: phone,
            permitted_until: access.permitted_until!,
            status: 'active',
          });

          const msg = `${greeting.trim()}\n\nAntes de começar, como posso te chamar? 😊`;
          await this.evolutionService.sendMessage(phone, msg);
          await this.logMessage(phone, messageText, 'name_request', msg);
          return msg;
        }

        const name = extractName(messageText);
        await pool.query('UPDATE users SET name = $1 WHERE phone_number = $2', [name, phone]);

        const msg = `Prazer em te conhecer, ${name}! 🤝\n\nA partir de agora sou seu amigo pessoal de bolso — pode contar comigo pra registrar gastos, lembrar de compromissos, tirar dúvidas e te ajudar no dia a dia. 💪\n\nManda aí o que precisar!`;
        await this.evolutionService.sendMessage(phone, msg);
        await this.logMessage(phone, messageText, 'name_capture', msg);
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
        await this.logMessage(phone, messageText, `restricted:${restrictionType}`, response);
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
      const intent = await this.claudeService.detectIntent(messageText, phone);

      // Short-term memory: last few turns, so the conversation actually
      // flows instead of restarting from zero on every single message.
      const history = await this.getRecentHistory(phone);

      let response: string;

      if (intent === 'expense_log') {
        const parsed = await this.claudeService.parseExpense(messageText, phone);
        await this.expenseService.logExpense(phone, parsed.amount, parsed.description);
        const today = await this.expenseService.getTodayTotal(phone);

        response = `✓ Anotei: R$${parsed.amount.toFixed(2)} em ${parsed.description}\n`;
        response += `Hoje você já registrou ${today.count} despesa${today.count !== 1 ? 's' : ''}, totalizando R$${today.total.toFixed(2)}.`;
        response = withFollowUp(response);
      } else if (intent === 'expense_query') {
        const expenses = await this.expenseService.getRecentExpenses(phone, 7);
        response = await this.claudeService.formatExpenseQuery(expenses, messageText, phone, systemPrompt, history);
      } else if (intent === 'reminder_query') {
        const reminders = await this.reminderService.getUpcomingReminders(phone);
        response = await this.claudeService.answerReminderQuery(reminders, messageText, phone, systemPrompt, history);
      } else if (intent === 'reminder_set') {
        try {
          const parsed = await this.claudeService.parseReminder(messageText, phone);
          const scheduledFor = new Date(parsed.scheduledFor);
          await this.reminderService.scheduleReminder(phone, scheduledFor, parsed.message, parsed.isRecurring);

          response = await this.claudeService.confirmReminder(
            parsed.message,
            formatDateTime(scheduledFor),
            parsed.isRecurring,
            systemPrompt,
            phone,
            history
          );
        } catch (err) {
          console.error('Reminder parsing failed:', err);
          response = 'Não consegui entender direito a data do lembrete. Pode tentar de novo? Ex: "lembrar de pagar conta amanhã às 10h" 😊';
        }
      } else {
        response = await this.claudeService.answerGeneralQuestion(messageText, phone, systemPrompt, history);
      }

      // Send response
      const delivered = await this.evolutionService.sendMessage(phone, response);
      if (!delivered) {
        console.error(`WhatsApp delivery failed for ${phone} - message was processed but never reached the user`);
      }
      await this.logMessage(phone, messageText, intent, response);
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
