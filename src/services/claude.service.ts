import axios from 'axios';
import { getEnv } from '../config/env';
import { Expense, ClaudeParseExpense } from '../types/index';

const env = getEnv();

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
      `Extraia o valor (amount) e descrição (description) dessa mensagem de gasto. Responda em JSON: {"amount": X, "description": "..."}

Mensagem: "${message}"`
    );

    try {
      const parsed = JSON.parse(response);
      return {
        amount: parseFloat(parsed.amount),
        description: parsed.description
      };
    } catch (err) {
      throw new Error(`Failed to parse expense: ${response}`);
    }
  }

  async formatExpenseQuery(expenses: Expense[], question: string): Promise<string> {
    const expenseList = expenses
      .map((e) => `R$${e.amount} em ${e.description}`)
      .join(', ');

    return this.callClaude(
      `O usuário perguntou: "${question}". Aqui estão seus gastos recentes: ${expenseList}. Responda de forma amigável em português (máximo 2 frases).`
    );
  }

  async answerGeneralQuestion(message: string): Promise<string> {
    return this.callClaude(
      `Responda à pergunta em português de forma clara e concisa (máximo 3 frases):\n\n${message}`
    );
  }

  private async callClaude(prompt: string): Promise<string> {
    const response = await axios.post(
      this.apiUrl,
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
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
