import axios from 'axios';
import { getEnv } from '../config/env.js';
import { getDatabase } from '../config/database.js';
import { retryWithBackoff } from '../utils/resilience.js';
import { Expense, Reminder, ClaudeParseExpense, ClaudeParseReminder } from '../types/index.js';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

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
      `Analise essa mensagem e categorize como 'expense_log' (registrar um gasto novo), 'expense_query' (perguntando sobre gastos passados), 'reminder_set' (pedindo para criar/agendar um lembrete ou compromisso novo), 'reminder_query' (perguntando sobre compromissos/lembretes já existentes, ex: "tenho algo marcado para amanhã?", "o que eu tenho essa semana?") ou 'general_question' (qualquer outra coisa). Responda APENAS a categoria (uma palavra).

Mensagem: "${message}"`,
      undefined,
      phone,
      'detectIntent'
    );

    const intent = response.toLowerCase().trim();
    if (['expense_log', 'expense_query', 'general_question', 'reminder_set', 'reminder_query'].includes(intent)) {
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
    phone: string,
    history: ConversationTurn[] = []
  ): Promise<string> {
    const prompt = `Acabei de agendar este lembrete para o usuário: "${reminderMessage}", para ${scheduledForText}${isRecurring ? ' (todos os dias nesse horário)' : ''}.

Gere uma confirmação curta (2-3 frases) e calorosa em português confirmando o lembrete, mencionando especificamente do que se trata, e perguntando se o horário está bom ou se quer mudar. Não use colchetes nem "..." - gere o texto final pronto para enviar.`;

    return this.callClaude(prompt, systemPrompt, phone, 'confirmReminder', history);
  }

  async formatExpenseQuery(
    expenses: Expense[],
    question: string,
    phone: string,
    systemPrompt?: string,
    history: ConversationTurn[] = []
  ): Promise<string> {
    const expenseList = expenses.length
      ? expenses.map((e) => `R$${e.amount} em ${e.description} (${new Date(e.created_at).toLocaleDateString('pt-BR')})`).join(', ')
      : 'nenhum gasto registrado nesse período';

    return this.callClaude(
      `O usuário perguntou: "${question}". Aqui estão os gastos reais dele que eu tenho registrados: ${expenseList}. Responda de forma natural e amigável em português (máximo 2-3 frases), usando só esses dados reais - não invente valores. Pode terminar com uma pergunta de acompanhamento se fizer sentido, mas não é obrigatório.`,
      systemPrompt,
      phone,
      'formatExpenseQuery',
      history
    );
  }

  /**
   * Answers questions about reminders/compromissos the user ALREADY has
   * scheduled (ex: "tenho algo marcado pra amanhã?"), grounded in the
   * actual reminders table instead of leaving Claude to guess - which is
   * what was happening before (there was no intent for this at all, so it
   * fell through to answerGeneralQuestion with zero knowledge of reminders
   * and would just say "não vejo nenhum" even with active reminders set).
   */
  async answerReminderQuery(
    reminders: Reminder[],
    question: string,
    phone: string,
    systemPrompt?: string,
    history: ConversationTurn[] = []
  ): Promise<string> {
    const reminderList = reminders.length
      ? reminders
          .map((r) => {
            const when = new Date(r.scheduled_for).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            const recurring = r.type === 'recurring' ? ' (todos os dias nesse horário)' : '';
            return `"${r.message}" em ${when}${recurring}`;
          })
          .join('; ')
      : 'nenhum lembrete ou compromisso agendado no momento';

    return this.callClaude(
      `O usuário perguntou: "${question}". Aqui estão os lembretes/compromissos reais que eu tenho agendados para ele: ${reminderList}. Responda de forma natural e direta em português (máximo 2-3 frases) usando SÓ esses dados reais - se a lista estiver vazia, diga claramente que não há nada agendado; se houver algo relevante à pergunta, mencione especificamente o quê e quando.`,
      systemPrompt,
      phone,
      'answerReminderQuery',
      history
    );
  }

  async answerGeneralQuestion(
    message: string,
    phone: string,
    systemPrompt?: string,
    history: ConversationTurn[] = []
  ): Promise<string> {
    return this.callClaude(message, systemPrompt, phone, 'answerGeneralQuestion', history);
  }

  /**
   * Reads a photographed/scanned receipt, grocery-store slip, or bank
   * statement/invoice via Claude's vision, and extracts every expense line
   * it can find - not just a single amount, since a supermarket receipt or
   * a card statement can legitimately have many.
   */
  async parseReceiptMedia(
    base64: string,
    mimeType: string,
    phone: string,
    caption?: string
  ): Promise<{ expenses: { amount: number; description: string }[]; merchant?: string }> {
    const isPdf = mimeType === 'application/pdf';
    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mimeType || 'image/jpeg', data: base64 } };

    const instruction = `Isso é um comprovante de compra, recibo, nota fiscal ou fatura/extrato bancário.${caption ? ` O usuário mandou junto esta legenda: "${caption}".` : ''} Extraia TODAS as despesas que conseguir identificar.

Regras:
- Se for um recibo simples com um valor só, retorne 1 item.
- Se for uma nota fiscal de mercado com vários produtos, agrupe por categoria (ex: "Mercado - hortifruti", "Mercado - limpeza e higiene") em vez de um item por produto - a menos que sejam poucos produtos (até 5), aí pode listar cada um.
- Se for fatura de cartão ou extrato bancário com várias transações, retorne uma linha por transação relevante (ignore taxas administrativas, juros e saldo anterior).
- Use o valor de cada item/transação exatamente como aparece no documento.
- Se não conseguir ler nada com confiança, retorne uma lista vazia - não invente valores.

Responda APENAS com JSON, sem texto antes ou depois:
{"merchant": "nome do estabelecimento ou banco se identificável, senão null", "expenses": [{"amount": X, "description": "..."}]}`;

    const response = await this.callClaudeMultimodal(contentBlock, instruction, phone, 'parseReceiptMedia');
    const parsed = extractJson(response);

    if (!parsed || !Array.isArray(parsed.expenses)) {
      return { expenses: [] };
    }

    return {
      merchant: parsed.merchant || undefined,
      expenses: parsed.expenses
        .filter((e: any) => e && e.amount !== undefined && e.description)
        .map((e: any) => ({ amount: parseFloat(e.amount), description: String(e.description) }))
    };
  }

  private async callClaudeMultimodal(
    contentBlock: Record<string, unknown>,
    instruction: string,
    phone: string,
    context: string
  ): Promise<string> {
    const response = await retryWithBackoff(
      () =>
        axios.post(
          this.apiUrl,
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1024,
            messages: [
              {
                role: 'user',
                content: [contentBlock, { type: 'text', text: instruction }]
              }
            ]
          },
          {
            headers: {
              'anthropic-version': '2023-06-01',
              'x-api-key': this.apiKey,
              'content-type': 'application/json'
            },
            timeout: 30000
          }
        ),
      2,
      500
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

  private async callClaude(
    prompt: string,
    system: string | undefined,
    phone: string,
    context: string,
    history: ConversationTurn[] = []
  ): Promise<string> {
    const response = await retryWithBackoff(
      () =>
        axios.post(
          this.apiUrl,
          {
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 400,
            ...(system ? { system } : {}),
            messages: [
              ...history.map((turn) => ({ role: turn.role, content: turn.content })),
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
            },
            timeout: 20000
          }
        ),
      2,
      500
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

  async logTokenUsage(phone: string, tokensConsumed: number, context: string): Promise<void> {
    const pool = getDatabase();
    await pool.query(
      'INSERT INTO token_usage (phone_number, tokens_consumed, context) VALUES ($1, $2, $3)',
      [phone, tokensConsumed, context]
    );
  }
}
