import { describe, it, expect, vi } from 'vitest';
import { ClaudeService } from '../../src/services/claude.service';

describe('ClaudeService', () => {
  const service = new ClaudeService();

  it('should have detectIntent method', () => {
    expect(typeof service.detectIntent).toBe('function');
  });

  it('should have parseExpense method', () => {
    expect(typeof service.parseExpense).toBe('function');
  });

  it('should have formatExpenseQuery method', () => {
    expect(typeof service.formatExpenseQuery).toBe('function');
  });

  it('should have answerGeneralQuestion method', () => {
    expect(typeof service.answerGeneralQuestion).toBe('function');
  });
});
