import { Router, Request, Response } from 'express';
import { MessageService } from '../services/message.service.js';

const router = Router();
const messageService = new MessageService();

/**
 * Extract a usable phone/identifier from a Baileys-style remoteJid.
 * Examples: "5511999999999@s.whatsapp.net", "147270251106509@lid", "123@g.us"
 */
function extractPhoneNumber(remoteJid: string | undefined): string | null {
  if (!remoteJid) return null;
  const [id] = remoteJid.split('@');
  return id || null;
}

/**
 * Extract plain text from a Baileys-style message object.
 * Different message types store text in different fields.
 */
function extractMessageText(message: any): string | null {
  if (!message) return null;

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.listResponseMessage?.title ||
    null
  );
}

router.post('/webhook', (req: Request, res: Response) => {
  // Acknowledge immediately so Evolution API never retries/times out,
  // regardless of whether we can parse this particular event.
  res.status(200).json({ status: 'ok' });

  try {
    const { event, data } = req.body;

    // Only handle incoming message events
    if (event && event !== 'messages.upsert') {
      return;
    }

    if (!data || !data.key || !data.message) {
      return;
    }

    // Ignore messages we sent ourselves (echo from our own bot replies)
    if (data.key.fromMe) {
      return;
    }

    const phoneNumber = extractPhoneNumber(data.key.remoteJid);
    const messageText = extractMessageText(data.message);

    if (!phoneNumber || !messageText) {
      return;
    }

    messageService.processMessage(phoneNumber, messageText).catch((err) => {
      console.error('Async message processing failed:', err);
    });
  } catch (error) {
    console.error('Webhook error:', error);
  }
});

export default router;
