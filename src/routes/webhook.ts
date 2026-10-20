import { Router, Request, Response } from 'express';
import { MessageService } from '../services/message.service';

const router = Router();
const messageService = new MessageService();

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { data } = req.body;

    if (!data || !data.message) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    const { phone_number, body: messageText } = data.message;

    if (!phone_number || !messageText) {
      return res.status(400).json({ error: 'Missing phone or message' });
    }

    // Process asynchronously
    messageService.processMessage(phone_number, messageText).catch((err) => {
      console.error('Async message processing failed:', err);
    });

    // Return 200 immediately to acknowledge webhook
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(200).json({ status: 'ok' });
  }
});

export default router;
