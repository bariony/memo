import axios from 'axios';
import { getEnv } from '../config/env.js';
import { getDatabase } from '../config/database.js';
import { Expense, ClaudeParseExpense, ClaudeParseReminder } from '../types/index.js';

const env = getEnv();

/**
 * Parse JSON out of an LLM response that may wrap it in markdown code
 * fences or add explanatory text before/after. Tries a direct parse
 * first, then falls back to extracting the first {...} block.
 */
function extractJson(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // fall through
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  return null;
}

export class ClaudeService {
  private apiKey = env.CLAUDE_API_KEY;
  private apiUrl = 'https://api.anthropic.com/v1/messages';

  async detectIntent(message: string, phone: string): Promise<string> {
    const response = await this.callClaude(
      `Analise essa mensagem e categorize como 'expense_log', 'expense_query', 'general_question' ou 'reminder_set'. Responda APENAS a categoria (uma palavra).

Mensagem: "${message}"`,
      undefined,
      phone,
      'detectIntent'
    );

    const intent = response.toLowerCase().trim();
    if (['expense_log', 'expense_query', 'general_question', 'reminder_set'].includes(intent)) {
      return intent;
    }
    return 'general_question';
  }

  async parseExpense(message: string, phone: string): Promise<ClaudeParseExpense> {
    const response = await this.callClaude(
      `Extraia o valor (amount) e descrição (description) dessa mensagem de gasto. Responda APENAS com o JSON, sem nenhum texto antes ou depois: {"amount": X, "description": "..."}

Mensagem: "${message}"`,
      undefined,
      phone,
      'parseExpense'
    );

    const parsed = extractJson(response);
    if (!parsed || parsed.amount === undefined || !parsed.description) {
      throw new Error(`Failed to parse expense: ${response}`);
    }

    return {
      amount: parseFloat(parsed.amount),
      description: parsed.description
    };
  }

  async parseReminder(message: string, phone: string): Promise<ClaudeParseReminder> {
    const now = new Date();
    const nowIso = now.toISOString();

    const response = await this.callClaude(
      `Data e hora atual: ${nowIso} (fuso America/Sao_Paulo).

Extraia dessa mensagem de lembrete: a data/hora agendada (scheduledFor, em ISO 8601, resolvendo expressões relativas como "amanhã" ou "sexta" a partir da data atual acima), o texto do lembrete (message, sem a parte de data/hora) e se é recorrente diário (isRecurring, true se a mensagem falar de algo "todo dia", "todos os dias", "diariamente", etc).

Responda APENAS com o JSON, sem nenhum texto antes ou depois: {"scheduledFor": "...", "message": "...", "isRecurring": false}

Mensagem: "${message}"`,
      undefined,
      phone,
      'parseReminder'
    );

    const parsed = extractJson(response);
    if (!parsed || !parsed.scheduledFor || !parsed.message) {
      throw new Error(`Failed to parse reminder: ${response}`);
    }

    return {
      scheduledFor: parsed.scheduledFor,
      message: parsed.message,
      isRecurring: Boolean(parsed.isRecurring)
    };
  }

  /**
   * Generate a warm, specific confirmation for a reminder that was just
   * scheduled - references what the reminder is about (not just a flat
   * "lembrete criado") and offers to adjust the time, matching the
   * assistant's conversational personality.
   */
  async confirmReminder(
    reminderMessage: string,
    scheduledForText: string,
    isRecurring: boolean,
    systemPrompt: string,
    phone: string
  ): Promise<string> {
    const prompt = `Acabei de agendar este lembrete para o usuário: "${reminderMessage}", para ${scheduledForText}${isRecurring ? ' (todos os dias nesse horário)' : ''}.

Gere uma confirmação curta (2-3 frases) e calorosa em português confirmando o lembrete, mencionando especificamente do que se trata, e perguntando se o horário está bom ou se quer mudar. Não use colchetes nem "..." - gere o texto final pronto para enviar.`;

    return this.callClaude(prompt, systemPrompt, phone, 'confirmReminder');
  }

  async formatExpenseQuery(expenses: Expense[], question: string, phone: string): Promise<string> {
    const expenseList = expenses
      .map((e) => `R$${e.amount} em ${e.description}`)
      .join(', ');

    return this.callClaude(
      `O usuário perguntou: "${question}". Aqui estão seus gastos recentes: ${expenseList}. Responda de forma amigável em português (máximo 2 frases), terminando com uma pergunta de acompanhamento.`,
      undefined,
      phone,
      'formatExpenseQuery'
    );
  }

  async answerGeneralQuestion(message: string, phone: string, systemPrompt?: string): Promise<string> {
    return this.callClaude(message, systemPrompt, phone, 'answerGeneralQuestion');
  }

  private async callClaude(
    prompt: string,
    system: string | undefined,
    phone: string,
    context: string
  ): Promise<string> {
    const response = await axios.post(
      this.apiUrl,
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        ...(system ? { system } : {}),
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'anthropic-version': '2023-06-01',
          'x-api-key': this.apiKey,
          'content-type': 'application/json'
        }
      }
    );

    const usage = response.data.usage;
    if (usage) {
      const tokensConsumed = (usage.input_tokens || 0) + (usage.output_tokens || 0);
      this.logTokenUsage(phone, tokensConsumed, context).catch((err) =>
        console.error('Failed to log token usage:', err)
      );
    }

    return response.data.content[0].text.trim();
  }

  private async logTokenUsage(phone: string, tokensConsumed: number, context: string): Promise<void> {
    const pool = getDatabase();
    await pool.query(
      'INSERT INTO token_usage (phone_number, tokens_consumed, context) VALUES ($1, $2, $3)',
      [phone, tokensConsumed, context]
    );
  }
}
