import axios from 'axios';
import { getEnv } from '../config/env.js';

const env = getEnv();

export class EvolutionService {
  private apiUrl = `https://api.evolution.br/message/sendText/${env.EVOLUTION_INSTANCE}`;
  private apiKey = env.EVOLUTION_API_KEY;

  async sendMessage(phone: string, text: string): Promise<void> {
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          number: phone,
          text: text
        },
        {
          headers: {
            'apikey': this.apiKey
          },
          timeout: 5000
        }
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Evolution API returned ${response.status}`);
      }
    } catch (error) {
      console.error(`Failed to send message to ${phone}:`, error);
      throw error;
    }
  }
}
