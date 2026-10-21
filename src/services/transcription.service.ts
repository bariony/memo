import { spawn } from 'child_process';
import { logger } from '../utils/logger.js';

/**
 * Transcodes audio to MP3 via the system `ffmpeg` binary (installed in the
 * Docker image specifically for this). WhatsApp voice notes arrive as
 * audio/ogg (Opus codec), which is NOT in OpenAI's list of accepted
 * transcription input formats (confirmed against the current official
 * docs: mp3, mp4, mpeg, mpga, m4a, wav, webm - no ogg) - sending the raw
 * file as-is would just get rejected by the API.
 */
function convertToMp3(input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-f', 'mp3',
      '-ar', '16000',
      '-ac', '1',
      'pipe:1',
    ]);

    const chunks: Buffer[] = [];
    let stderr = '';

    ffmpeg.stdout.on('data', (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    ffmpeg.on('error', reject);
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      }
    });

    ffmpeg.stdin.on('error', () => {
      // EPIPE etc if ffmpeg exits before we finish writing - the 'close'
      // handler above already captures the real failure reason.
    });
    ffmpeg.stdin.write(input);
    ffmpeg.stdin.end();
  });
}

/**
 * Transcribes a WhatsApp voice note via OpenAI's speech-to-text API.
 * Claude's own Messages API has no audio input content type (confirmed
 * against the current official docs - only text, image and document/PDF
 * blocks exist), so some external speech-to-text has to do this step.
 *
 * Uses gpt-transcribe rather than whisper-1: cheaper per OpenAI's current
 * pricing page, and unlike gpt-4o-transcribe/gpt-4o-mini-transcribe (which
 * that same page lists as deprecated, shutting down February 2027) it's
 * the model OpenAI currently recommends for new integrations.
 *
 * Returns null - never throws - when OPENAI_API_KEY isn't configured yet,
 * ffmpeg isn't available, or the call fails, so callers can degrade
 * gracefully ("can't understand audio yet, please type it") instead of
 * breaking the message flow.
 */
export async function transcribeAudio(base64: string, mimetype: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn('OPENAI_API_KEY not configured - skipping audio transcription', 'TranscriptionService');
    return null;
  }

  try {
    const rawBuffer = Buffer.from(base64, 'base64');
    const mp3Buffer = await convertToMp3(rawBuffer);
    const blob = new Blob([mp3Buffer], { type: 'audio/mpeg' });

    const form = new FormData();
    form.append('file', blob, 'audio.mp3');
    form.append('model', 'gpt-transcribe');
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
    logger.error('Failed to transcribe audio', err, 'TranscriptionService', { mimetype });
    return null;
  }
}

export const transcriptionService = { transcribeAudio };
