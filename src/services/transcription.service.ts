import { logger } from '../utils/logger.js';

/**
 * Transcribes a WhatsApp voice note via OpenAI's Whisper API. Claude's own
 * Messages API has no audio input content type (confirmed against the
 * current official docs - only text, image and document/PDF blocks exist),
 * so some external speech-to-text has to do this step.
 *
 * Returns null - never throws - when OPENAI_API_KEY isn't configured yet or
 * the call fails, so callers can degrade gracefully ("can't understand
 * audio yet, please type it") instead of breaking the message flow.
 */
export async function transcribeAudio(base64: string, mimetype: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not configured - skipping audio transcription', 'TranscriptionService');
    return null;
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const blob = new Blob([buffer], { type: mimetype || 'audio/ogg' });

    const form = new FormData();
    form.append('file', blob, 'audio.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI transcription error: ${response.status} - ${errorText}`);
    }

    const data: any = await response.json();
    const text = String(data.text || '').trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    logger.error('Failed to transcribe audio', err, 'TranscriptionService');
    return null;
  }
}

export const transcriptionService = { transcribeAudio };
