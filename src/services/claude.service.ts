import axios from 'axios';
import { getEnv } from '../config/env.js';
import { Expense, ClaudeParseExpense } from '../types/index.js';

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

  async detectIntent(message: string): Promise<string> {
    const response = await this.callClaude(
      `Analise essa mensagem e categorize como 'expense_log', 'expense_query', 'general_question' ou 'reminder_set'. Responda APENAS a categoria (uma palavra).

Mensagem: "${message}"`
    );

    const intent = response.toLowerCase().trim();
    if (['expense_log', 'expense_query', 'general_question', 'reminder_set'].includes(intent)) {
      return intent;
    }
    return 'general_question';
  }

  async parseExpense(message: string): Promise<ClaudeParseExpense> {
    const response = await this.callClaude(
      `Extraia o valor (amount) e descrição (description) dessa mensagem de gasto. Responda APENAS com o JSON, sem nenhum texto antes ou depois: {"amount": X, "description": "..."}

Mensagem: "${message}"`
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

  async formatExpenseQuery(expenses: Expense[], question: string): Promise<string> {
    const expenseList = expenses
      .map((e) => `R$${e.amount} em ${e.description}`)
      .join(', ');

    return this.callClaude(
      `O usuário perguntou: "${question}". Aqui estão seus gastos recentes: ${expenseList}. Responda de forma amigável em português (máximo 2 frases).`
    );
  }

  async answerGeneralQuestion(message: string, systemPrompt?: string): Promise<string> {
    return this.callClaude(message, systemPrompt);
  }

  private async callClaude(prompt: string, system?: string): Promise<string> {
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

    return response.data.content[0].text.trim();
  }
}
