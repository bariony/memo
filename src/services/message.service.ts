import { ClaudeService } from './claude.service.js';
import { WhitelistService } from './whitelist.service.js';
import { ExpenseService } from './expense.service.js';
import { ReminderService } from './reminder.service.js';
import { evolution } from './evolution.service.js';
import { getDatabase } from '../config/database.js';
import { assistantService } from './assistant.service.js';
import { detectRestrictionType, getSmartResponse } from '../config/assistantResponses.js';

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

      // 2. Ensure user exists
      const pool = getDatabase();
      await pool.query(
        'INSERT INTO users (phone_number) VALUES ($1) ON CONFLICT DO NOTHING',
        [phone]
      );

      // 3. Smart contour: catch out-of-scope requests before hitting Claude,
      // so the user gets a helpful "here's what I CAN do" instead of a flat
      // refusal (and we save an API call).
      const restrictionType = detectRestrictionType(messageText);
      if (restrictionType) {
        const response = getSmartResponse(restrictionType, phone);
        await this.evolutionService.sendMessage(phone, response);
        return response;
      }

      // 4. Build the full assistant personality/system prompt for this user
      const systemPrompt = assistantService.getSystemPrompt({
        phone_number: phone,
        permitted_until: access.permitted_until!,
        status: 'active',
      });

      // 5. Detect intent
      const intent = await this.claudeService.detectIntent(messageText);

      let response: string;

      if (intent === 'expense_log') {
        const parsed = await this.claudeService.parseExpense(messageText);
        await this.expenseService.logExpense(phone, parsed.amount, parsed.description);
        response = `✓ Registrado: R$${parsed.amount} em ${parsed.description}`;
      } else if (intent === 'expense_query') {
        const expenses = await this.expenseService.getRecentExpenses(phone, 7);
        response = await this.claudeService.formatExpenseQuery(expenses, messageText);
      } else if (intent === 'reminder_set') {
        response = 'Lembrete agendado!';
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
