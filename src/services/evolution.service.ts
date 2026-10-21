import { logger } from '../utils/logger.js';
import { getEnv } from '../config/env.js';

const env = getEnv();

/**
 * Evolution API service for WhatsApp messaging
 * Handles sending messages via WhatsApp Business API
 */

interface EvolutionMessage {
  phoneNumber: string;
  message: string;
  mediaUrl?: string;
}

/**
 * Send message via Evolution API / WhatsApp
 */
export async function sendMessage(phoneNumber: string, message: string): Promise<boolean> {
  try {
    // Remove any formatting characters
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    // In development/mock mode, just log
    const evolutionUrl = (process.env.EVOLUTION_API_URL || '').trim();
    if (env.NODE_ENV === 'development' || !evolutionUrl) {
      logger.info(
        `[MOCK] WhatsApp message would be sent`,
        'EvolutionService',
        {
          phoneNumber: cleanPhone,
          messageLength: message.length,
          firstLine: message.split('\n')[0],
        }
      );
      return true;
    }

    // Real Evolution API call - retried once on transient failures (network
    // blip, instance briefly reconnecting) instead of silently dropping the
    // message, which is what was happening before: this function always
    // swallowed its own errors and returned false, and nothing upstream
    // checked that return value, so a flaky send just meant total silence
    // for the user with no retry and no visibility.
    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await fetch(`${evolutionUrl}/message/sendText/${env.EVOLUTION_INSTANCE}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': env.EVOLUTION_API_KEY,
          },
          body: JSON.stringify({
            number: cleanPhone,
            text: message,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`Evolution API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        logger.info(
          'WhatsApp message sent successfully',
          'EvolutionService',
          { phoneNumber: cleanPhone, messageLength: message.length, attempt }
        );

        return true;
      } catch (err) {
        lastError = err;
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    throw lastError;
  } catch (err) {
    logger.error('Failed to send WhatsApp message after retry', err, 'EvolutionService', {
      phoneNumber,
      messageLength: message.length,
    });
    return false;
  }
}

/**
 * Send message with media
 */
export async function sendMediaMessage(
  phoneNumber: string,
  mediaUrl: string,
  caption?: string
): Promise<boolean> {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const evolutionUrl = (process.env.EVOLUTION_API_URL || '').trim();

    if (env.NODE_ENV === 'development' || !evolutionUrl) {
      logger.info(
        `[MOCK] WhatsApp media message would be sent`,
        'EvolutionService',
        {
          phoneNumber: cleanPhone,
          mediaUrl,
          caption,
        }
      );
      return true;
    }

    const response = await fetch(`${evolutionUrl}/message/sendMedia/${env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': env.EVOLUTION_API_KEY,
      },
      body: JSON.stringify({
        number: cleanPhone,
        mediaUrl,
        caption,
      }),
    });

    if (!response.ok) {
      throw new Error(`Evolution API error: ${response.status}`);
    }

    logger.info(
      'WhatsApp media message sent',
      'EvolutionService',
      { phoneNumber: cleanPhone, mediaUrl }
    );

    return true;
  } catch (err) {
    logger.error('Failed to send WhatsApp media message', err, 'EvolutionService');
    return false;
  }
}

export interface MediaContent {
  base64: string;
  mimetype: string;
}

/**
 * Fetch the decoded (base64) content of an incoming media message - photo
 * of a receipt, PDF invoice, etc. Evolution API decrypts the WhatsApp media
 * server-side and returns it given the message's own key, via its
 * `getBase64FromMediaMessage` endpoint. Response field names have drifted
 * across Evolution API versions, so this reads several possible shapes
 * defensively rather than assuming one.
 */
export async function getMediaBase64(messageKey: unknown): Promise<MediaContent | null> {
  try {
    const evolutionUrl = (process.env.EVOLUTION_API_URL || '').trim();

    if (env.NODE_ENV === 'development' || !evolutionUrl) {
      logger.info('[MOCK] Would fetch media base64', 'EvolutionService');
      return null;
    }

    const response = await fetch(
      `${evolutionUrl}/chat/getBase64FromMediaMessage/${env.EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': env.EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ message: { key: messageKey }, convertToMp4: false }),
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Evolution API media fetch error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data: any = await response.json();
    const base64 = data.base64 ?? data.data?.base64 ?? data.media?.base64;
    const mimetype = data.mimetype ?? data.mediaType ?? data.data?.mimetype ?? 'application/octet-stream';

    if (!base64) {
      logger.warn('Media fetch succeeded but response had no base64 field', 'EvolutionService', {
        responseKeys: Object.keys(data || {}),
      });
      return null;
    }

    return { base64, mimetype };
  } catch (err) {
    logger.error('Failed to fetch media base64', err, 'EvolutionService');
    return null;
  }
}

export const evolution = {
  sendMessage,
  sendMediaMessage,
  getMediaBase64,
};
