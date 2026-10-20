import { getAssistantPrompt, getGreetingMessage } from '../config/assistantPrompt.js';
import { logger } from '../utils/logger.js';
import { errors } from '../utils/errors.js';

interface UserAccessInfo {
  phone_number: string;
  permitted_until: string;
  status: 'active' | 'revoked' | 'expired';
  name?: string;
}

export class AssistantService {
  /**
   * Calculate remaining days for a user
   */
  private calculateRemainingDays(permitEndDate: string): number {
    const endDate = new Date(permitEndDate);
    const today = new Date();

    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Get system prompt for the assistant
   */
  getSystemPrompt(userInfo: UserAccessInfo): string {
    // Validate user access
    const remainingDays = this.calculateRemainingDays(userInfo.permitted_until);

    if (userInfo.status === 'revoked') {
      throw errors.userDisabled(userInfo.phone_number);
    }

    if (userInfo.status === 'expired' || remainingDays <= 0) {
      throw errors.userDisabled(userInfo.phone_number);
    }

    logger.info(
      `Generated system prompt for user`,
      'AssistantService',
      { phone: userInfo.phone_number, remainingDays }
    );

    return getAssistantPrompt(userInfo.phone_number, remainingDays, userInfo.name);
  }

  /**
   * Get greeting message for a new conversation
   */
  getGreetingMessage(userInfo: UserAccessInfo): string {
    const remainingDays = this.calculateRemainingDays(userInfo.permitted_until);

    if (remainingDays <= 0) {
      throw errors.userDisabled(userInfo.phone_number);
    }

    logger.info(
      `Generated greeting message for user`,
      'AssistantService',
      { phone: userInfo.phone_number, remainingDays }
    );

    return getGreetingMessage(remainingDays, userInfo.name);
  }

  /**
   * Check if user should be shown greeting (first message of the day)
   */
  shouldShowGreeting(lastInteractionDate?: string): boolean {
    if (!lastInteractionDate) {
      return true; // First ever interaction
    }

    const lastDate = new Date(lastInteractionDate);
    const today = new Date();

    // Show greeting if last interaction was on a different day
    return lastDate.toDateString() !== today.toDateString();
  }

  /**
   * Format user message for logging
   */
  formatLogMessage(content: string, type: 'text' | 'image' | 'audio' | 'file' = 'text'): string {
    const maxLen = 100;
    const preview = content.length > maxLen ? content.substring(0, maxLen) + '...' : content;

    return `[${type.toUpperCase()}] ${preview}`;
  }

  /**
   * Validate message input before sending to assistant
   */
  validateUserMessage(
    message: string,
    type: 'text' | 'image' | 'audio' | 'file' = 'text'
  ): { valid: boolean; error?: string } {
    // Empty message
    if (!message || message.trim().length === 0) {
      return { valid: false, error: 'Mensagem vazia. Digite algo!' };
    }

    // Max length
    const maxLength = 5000;
    if (message.length > maxLength) {
      return { valid: false, error: `Mensagem muito longa (máx ${maxLength} caracteres)` };
    }

    // For non-text types
    if (type === 'image') {
      return { valid: true }; // Images are OK
    }

    if (type === 'audio') {
      return { valid: true }; // Audio will be transcribed
    }

    if (type === 'file') {
      // Only PDFs and images allowed
      if (!message.toLowerCase().match(/\.(pdf|jpg|jpeg|png|gif)$/)) {
        return { valid: false, error: 'Arquivo não suportado. Envie PDF ou imagem.' };
      }
      return { valid: true };
    }

    return { valid: true };
  }

  /**
   * Detect if user is trying to do something not allowed
   */
  detectRestrictionViolation(message: string): string | null {
    const lowerMsg = message.toLowerCase();

    // Trying to get code
    if (
      lowerMsg.includes('código') ||
      lowerMsg.includes('code') ||
      lowerMsg.includes('script') ||
      lowerMsg.includes('programa')
    ) {
      return 'code';
    }

    // Trying to generate image/video
    if (
      lowerMsg.includes('gera') &&
      (lowerMsg.includes('imagem') || lowerMsg.includes('vídeo') || lowerMsg.includes('foto'))
    ) {
      return 'generation';
    }

    // Trying to talk about company
    if (
      lowerMsg.includes('empresa') ||
      lowerMsg.includes('memo') ||
      lowerMsg.includes('como você funciona internamente')
    ) {
      return 'company';
    }

    // Trying to bypass system
    if (
      lowerMsg.includes('burla') ||
      lowerMsg.includes('vulnerabilidade') ||
      lowerMsg.includes('hack') ||
      lowerMsg.includes('exploit')
    ) {
      return 'bypass';
    }

    return null;
  }

  /**
   * Build context for assistant based on conversation history
   */
  buildContextFromHistory(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    maxMessages: number = 5
  ): string {
    const recentMessages = messages.slice(-maxMessages);

    return recentMessages
      .map((msg) => {
        const role = msg.role === 'user' ? 'Usuário' : 'Assistente';
        return `${role}: ${msg.content}`;
      })
      .join('\n');
  }

  /**
   * Format assistant response for WhatsApp
   */
  formatResponseForWhatsApp(
    content: string,
    includeOptionsMenu: boolean = false
  ): string {
    // Ensure response doesn't exceed WhatsApp limits
    const maxLen = 4096;

    if (content.length > maxLen) {
      return content.substring(0, maxLen - 20) + '...\n(mensagem truncada)';
    }

    return content;
  }
}

export const assistantService = new AssistantService();
