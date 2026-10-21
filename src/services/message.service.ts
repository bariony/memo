import { ClaudeService, ConversationTurn } from './claude.service.js';
import { WhitelistService } from './whitelist.service.js';
import { ExpenseService } from './expense.service.js';
import { ReminderService } from './reminder.service.js';
import { accessRequestService } from './accessRequest.service.js';
import { evolution } from './evolution.service.js';
import { getDatabase } from '../config/database.js';
import { getEnv } from '../config/env.js';
import { assistantService } from './assistant.service.js';
import { detectRestrictionType, getSmartResponse } from '../config/assistantResponses.js';
import { normalizePhone } from '../utils/validator.js';

const FOLLOW_UP = '\n\nPosso ajudar com mais alguma coisa? 😊';
const TRIAL_DAYS = 14;

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

/**
 * Warm, personalized access-granted message - used whether the admin
 * approved via the WhatsApp "aprovar" command or the admin panel button.
 * Falls back to a neutral greeting if no name was on file for some reason.
 */
export function buildWelcomeMessage(name: string | null | undefined, days: number, untilText: string): string {
  const greeting = name ? `Boas notícias, ${name}! 🎉` : '🎉 Boas notícias!';
  return `${greeting}\n\nSeu acesso ao Memo foi liberado por ${days} dias (até ${untilText}). Sou seu assistente pessoal de bolso - posso te ajudar a registrar gastos, criar lembretes e tirar dúvidas do dia a dia.\n\nManda aí o que precisar! 😊`;
}

/**
 * Loose yes/no read on a short free-text reply to "quer solicitar acesso?".
 * Checks whole-message matches first (the common case - just "sim" or
 * "não"), then falls back to word-boundary search within a longer reply.
 */
function detectYesNo(text: string): 'yes' | 'no' | 'unclear' {
  const lower = text.trim().toLowerCase().replace(/[.!?]/g, '');

  if (['sim', 's', 'quero', 'com certeza', 'claro', 'bora', 'positivo', 'isso'].includes(lower)) return 'yes';
  if (['não', 'nao', 'n', 'negativo', 'agora não', 'agora nao'].includes(lower)) return 'no';

  if (/\bn(ã|a)o\b/.test(lower)) return 'no';
  if (/\bsim\b/.test(lower) || /\bquero\b/.test(lower)) return 'yes';

  return 'unclear';
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

  /**
   * The admin's own WhatsApp number gets a special command path so he can
   * approve/deny access requests by just replying "aprovar <numero>" or
   * "negar <numero>" to the notification Memo sends him - no need to open
   * the admin panel for the common case.
   */
  private async handleAdminCommand(messageText: string): Promise<string | null> {
    const approveMatch = messageText.match(/^\s*aprovar\s+(\S+)/i);
    const denyMatch = messageText.match(/^\s*negar\s+(\S+)/i);
    if (!approveMatch && !denyMatch) return null;

    const targetPhone = normalizePhone((approveMatch ?? denyMatch)![1]);
    const request = await accessRequestService.findPendingByPhone(targetPhone);

    if (approveMatch) {
      const permittedUntil = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      await this.whitelistService.addUser(targetPhone, permittedUntil);
      if (request) await accessRequestService.resolve(request.id, 'approved');

      const dateText = formatDateTime(permittedUntil).split(',')[0];
      const userMsg = buildWelcomeMessage(request?.name, TRIAL_DAYS, dateText);
      await this.evolutionService.sendMessage(targetPhone, userMsg);

      const reply = request
        ? `✅ Acesso liberado para ${request.name ?? targetPhone} (${targetPhone}) por ${TRIAL_DAYS} dias, até ${dateText}.`
        : `✅ Acesso liberado para ${targetPhone} por ${TRIAL_DAYS} dias, até ${dateText} (não havia pedido pendente registrado para esse número).`;
      await this.evolutionService.sendMessage(getEnv().ADMIN_PHONE_NUMBER, reply);
      return reply;
    }

    // deny
    if (request) await accessRequestService.resolve(request.id, 'denied');
    const userMsg = 'Oi! Vi sua solicitação de acesso, mas não vou poder liberar dessa vez. Qualquer dúvida, é só chamar 😊';
    await this.evolutionService.sendMessage(targetPhone, userMsg);

    const reply = request
      ? `🚫 Pedido de ${request.name ?? targetPhone} (${targetPhone}) negado.`
      : `🚫 Marcado como negado para ${targetPhone} (não havia pedido pendente registrado para esse número).`;
    await this.evolutionService.sendMessage(getEnv().ADMIN_PHONE_NUMBER, reply);
    return reply;
  }

  /**
   * A brand-new, never-seen number messaging the bot. Gated flow so a
   * wrong number or random text doesn't turn into an admin notification:
   * ask "want access?" first, only ask the name (and notify the admin) on
   * an explicit yes, and stop pinging again on an explicit no.
   */
  private async handleNewContactRequest(phone: string, messageText: string): Promise<string> {
    const pool = getDatabase();
    await pool.query('INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING', [phone]);

    const userResult = await pool.query(
      'SELECT name, name_requested_at, access_prompt_sent_at, access_prompt_status FROM users WHERE phone_number = $1',
      [phone]
    );
    const user = userResult.rows[0] as {
      name: string | null;
      name_requested_at: Date | null;
      access_prompt_sent_at: Date | null;
      access_prompt_status: string | null;
    };

    // Name already known: this contact already made it past the gate at
    // some point (pending, or previously denied and trying again). Don't
    // re-notify the admin on every repeat message, just reassure them.
    if (user.name) {
      const pending = await accessRequestService.findPendingByPhone(phone);
      const msg = pending
        ? `Oi, ${user.name}! Seu pedido de acesso ainda está aguardando liberação do administrador. Assim que for aprovado, te aviso por aqui 😊`
        : `Oi, ${user.name}! Vou encaminhar seu pedido de acesso de novo para o administrador.`;

      if (!pending) {
        await accessRequestService.createIfNotPending(phone, user.name);
        const adminMsg = `🔔 *Nova solicitação de acesso*\n\n👤 Nome: ${user.name}\n📱 WhatsApp: ${phone}\n\nResponda *aprovar ${phone}* para liberar ${TRIAL_DAYS} dias de teste, ou *negar ${phone}* para recusar.`;
        await this.evolutionService.sendMessage(getEnv().ADMIN_PHONE_NUMBER, adminMsg);
      }

      await this.evolutionService.sendMessage(phone, msg);
      await this.logMessage(phone, messageText, 'access_request_reminder', msg);
      return msg;
    }

    // Already said no before - don't keep re-asking or bothering the admin.
    if (user.access_prompt_status === 'declined') {
      const msg = 'Oi! Se quiser solicitar acesso ao Memo é só me avisar por aqui 😊';
      await this.evolutionService.sendMessage(phone, msg);
      await this.logMessage(phone, messageText, 'access_prompt_declined_followup', msg);
      return msg;
    }

    // Already said yes - this message is their answer to "como se chama?".
    if (user.access_prompt_status === 'confirmed') {
      const name = extractName(messageText);
      await pool.query('UPDATE users SET name = $1 WHERE phone_number = $2', [name, phone]);

      const { isNew } = await accessRequestService.createIfNotPending(phone, name);
      if (isNew) {
        const adminMsg = `🔔 *Nova solicitação de acesso*\n\n👤 Nome: ${name}\n📱 WhatsApp: ${phone}\n\nResponda *aprovar ${phone}* para liberar ${TRIAL_DAYS} dias de teste, ou *negar ${phone}* para recusar.`;
        await this.evolutionService.sendMessage(getEnv().ADMIN_PHONE_NUMBER, adminMsg);
      }

      const msg = `Prazer, ${name}! 🙌 Já encaminhei seu pedido de acesso. Assim que for liberado, te aviso por aqui e já podemos começar!`;
      await this.evolutionService.sendMessage(phone, msg);
      await this.logMessage(phone, messageText, 'access_request_created', msg);
      return msg;
    }

    // Gate not sent yet - first message ever from this number.
    if (!user.access_prompt_sent_at) {
      await pool.query('UPDATE users SET access_prompt_sent_at = NOW() WHERE phone_number = $1', [phone]);
      const msg = 'Oi! 👋 Eu sou o Memo, seu assistente pessoal de bolso — ajudo a organizar gastos, lembretes e tirar dúvidas do dia a dia pelo WhatsApp.\n\nVi que você ainda não tem acesso por aqui. Quer solicitar? Responda *sim* ou *não* 😊';
      await this.evolutionService.sendMessage(phone, msg);
      await this.logMessage(phone, messageText, 'access_prompt_sent', msg);
      return msg;
    }

    // Gate already sent, no answer recorded yet - this message is that answer.
    const answer = detectYesNo(messageText);

    if (answer === 'no') {
      await pool.query("UPDATE users SET access_prompt_status = 'declined' WHERE phone_number = $1", [phone]);
      const msg = 'Sem problemas! Se mudar de ideia, é só me chamar por aqui 😊';
      await this.evolutionService.sendMessage(phone, msg);
      await this.logMessage(phone, messageText, 'access_prompt_declined', msg);
      return msg;
    }

    if (answer === 'unclear') {
      const msg = 'Não entendi — quer solicitar acesso ao Memo? Responda *sim* ou *não* 😊';
      await this.evolutionService.sendMessage(phone, msg);
      await this.logMessage(phone, messageText, 'access_prompt_unclear', msg);
      return msg;
    }

    // 'yes'
    await pool.query("UPDATE users SET access_prompt_status = 'confirmed' WHERE phone_number = $1", [phone]);
    const msg = 'Boa! Como você se chama? 😊';
    await this.evolutionService.sendMessage(phone, msg);
    await this.logMessage(phone, messageText, 'access_prompt_confirmed', msg);
    return msg;
  }

  async processMessage(phone: string, messageText: string): Promise<string> {
    try {
      // 0. Admin WhatsApp commands ("aprovar <numero>" / "negar <numero>")
      // bypass everything else, whether or not the admin's own number is
      // itself whitelisted.
      if (normalizePhone(phone) === normalizePhone(getEnv().ADMIN_PHONE_NUMBER)) {
        const adminReply = await this.handleAdminCommand(messageText);
        if (adminReply !== null) return adminReply;
      }

      // 1. Validate whitelist
      const access = await this.whitelistService.validateAccess(phone);
      if (!access.authorized) {
        if (access.reason === 'not_found') {
          return this.handleNewContactRequest(phone, messageText);
        }

        const msg = access.reason === 'expired'
          ? 'Oi! 👋 Eu sou o Memo, seu assistente pessoal.\n\nVi que seu acesso expirou. Para continuar comigo e não perder seu histórico de gastos e lembretes, fala com o Igor para renovar: 📞 11 98668-3737\n\nAssim que renovar, volto a te ajudar! 😊'
          : 'Oi! 👋 Eu sou o Memo, seu assistente pessoal.\n\nSeu acesso foi desativado por aqui. Se quiser voltar a usar, fala com o Igor: 📞 11 98668-3737 😊';

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
