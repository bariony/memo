/**
 * Smart response contours instead of redirecting to admin
 * User asks for something outside scope → show what we CAN help with
 */

export const RESTRICTION_RESPONSES = {
  // Trying to get code
  code: {
    response: `Não consigo gerar código para você. 😅

Mas eu posso ajudar com:
✓ Registrar suas despesas e acompanhar gastos
✓ Criar lembretes de tarefas e compromissos
✓ Tirar dúvidas sobre assuntos práticos
✓ Orientar você em decisões do dia a dia

Quer registrar uma despesa agora ou criar um lembrete? 😊`,
  },

  // Trying to generate image/video
  generation: {
    response: `Não posso gerar imagens ou vídeos. 😅

Mas eu posso ajudar com:
✓ Organizar suas despesas (pode até enviar foto do comprovante!)
✓ Criar lembretes de tarefas
✓ Responder dúvidas práticas
✓ Ajudar você a planejar e poupar

Tem algo que eu possa fazer por você? 😊`,
  },

  // Trying to talk about company internals
  company: {
    response: `Sou seu assistente pessoal, então não converso sobre detalhes da empresa. 😊

Mas posso ajudar você com:
✓ Registrar compras e controlar gastos
✓ Criar lembretes e tarefas
✓ Tirar dúvidas práticas
✓ Ajudar a organizar seu dia

O que você precisa? 😊`,
  },

  // Trying to bypass system
  bypass: {
    response: `Entendi que você quer testar meus limites, mas prefiro focar em ajudar você mesmo! 😊

Deixa eu fazer o que faço bem:
✓ Rastrear suas despesas
✓ Criar lembretes importantes
✓ Responder suas dúvidas
✓ Orientar em decisões práticas

Vamos começar? 😊`,
  },

  // Generic out of scope
  generic: {
    response: `Essa é uma pergunta interessante, mas sai um pouco do que faço bem. 😊

Meu foco é ajudar você com:
✓ Despesas e gastos
✓ Lembretes e tarefas
✓ Dúvidas práticas do dia a dia
✓ Organização pessoal

Posso ajudar com algo nessas áreas? 😊`,
  },

  // Spam/repeated requests
  spam: {
    response: `Percebi que você está pedindo a mesma coisa várias vezes. 😊

Só queria confirmar: você quer mesmo ajuda com isso ou posso te ajudar com algo mais produtivo?

Estou aqui para:
✓ Registrar despesas
✓ Criar lembretes
✓ Responder dúvidas
✓ Orientação pessoal

Qual você prefere? 😊`,
  },

  // User is stressed/angry
  stressed: {
    response: `Vejo que você está estressado. Tudo bem! 😊

Eu estou aqui para ajudar a deixar sua vida mais organizada e menos estressante.

Posso:
✓ Ajudar a organizar suas despesas (talvez economizar?)
✓ Lembrar tarefas para você não esquecer
✓ Ouvir suas dúvidas e orientar
✓ Apoiar você nas decisões

Quer conversar sobre algo? Eu ouço. 👂`,
  },

  // Rate limited (too many requests)
  rate_limit: {
    response: `Você está enviando muitas mensagens rápido demais. 😊

Deixa eu processar o que você pediu antes. Vou responder em alguns segundos.

Se tiver dúvidas, é só aguardar um pouco que estarei com você! ⏳`,
  },

  // Bot having issues
  bot_error: {
    response: `Ops, tive um erro processando sua mensagem. 😅

Deixa eu tentar de novo. Se o problema continuar:

✓ Tenta enviar de novo em alguns segundos
✓ Se nada funcionar, me manda um oi simples que a gente resolve junto

Desculpa o inconveniente! 🙏`,
  },
};

/**
 * Detect restriction type from user message
 */
export function detectRestrictionType(message: string): keyof typeof RESTRICTION_RESPONSES | null {
  const lower = message.toLowerCase();

  // Code patterns - requires an action verb + the target, not just the
  // bare word. Previously "código" or "programa" alone would match, which
  // also fires on totally ordinary messages like "qual o código postal"
  // or "vou ver um programa na tv" - derailing a normal conversation into
  // a canned capability list instead of answering naturally.
  const codeVerb = /(cria|gera|escreve|faz|manda)\s*(um|uma|o|a)?\s*(código|script|programa)\b/;
  if (
    codeVerb.test(lower) ||
    lower.includes('em python') ||
    lower.includes('em javascript') ||
    lower.includes('em typescript')
  ) {
    return 'code';
  }

  // Generation patterns
  if (
    (lower.includes('gera') || lower.includes('cria')) &&
    (lower.includes('imagem') || lower.includes('vídeo') || lower.includes('foto') || lower.includes('desenha'))
  ) {
    return 'generation';
  }

  // Company talk - specifically about Memo itself, not any mention of
  // "empresa" (the user may well be talking about their OWN job/company).
  if (
    (lower.includes('memo') && (lower.includes('empresa') || lower.includes('como você funciona') || lower.includes('por dentro'))) ||
    lower.includes('quem criou você') ||
    lower.includes('quem te criou') ||
    lower.includes('seu roadmap')
  ) {
    return 'company';
  }

  // Bypass attempts - "segurança" alone is way too common in everyday
  // Portuguese (financial security, job security, etc) to use as a trigger.
  if (
    lower.includes('burlar') ||
    lower.includes('vulnerabilidade') ||
    lower.includes('hackear') ||
    lower.includes('exploit')
  ) {
    return 'bypass';
  }

  return null;
}

/**
 * Get the smart response instead of redirecting to admin
 */
export function getSmartResponse(
  restrictionType: keyof typeof RESTRICTION_RESPONSES | null,
  userPhone?: string
): string {
  if (restrictionType && RESTRICTION_RESPONSES[restrictionType]) {
    return RESTRICTION_RESPONSES[restrictionType].response;
  }

  return RESTRICTION_RESPONSES.generic.response;
}

/**
 * Build personalized menu based on user context
 */
export function buildPersonalizedMenu(userContext?: {
  hasExpenses?: boolean;
  hasReminders?: boolean;
  lastAction?: string;
}): string {
  let menu = '\n\n📋 *O que posso fazer por você:*\n';

  menu += '1️⃣ Registrar uma despesa\n';
  menu += '   "Gastei R$ 200 no mercado"\n';
  menu += '   (ou envie foto do comprovante)\n\n';

  menu += '2️⃣ Criar um lembrete\n';
  menu += '   "Lembrar de pagar conta dia 15"\n';
  menu += '   "Lembrete de saúde 8 da manhã todos os dias"\n\n';

  menu += '3️⃣ Tirar uma dúvida\n';
  menu += '   "Como funciona PIX?"\n\n';

  menu += '4️⃣ Pedir orientação\n';
  menu += '   "Como começo a economizar?"\n';

  return menu;
}

/**
 * Detect if user is stressed based on message
 */
export function detectUserStress(message: string): boolean {
  const stressIndicators = [
    '!!!',
    'caramba',
    'tá difícil',
    'não aguento',
    'fugi do script',
    'não funciona',
    'bug',
    'tá ruim',
  ];

  const lower = message.toLowerCase();
  return stressIndicators.some((indicator) => lower.includes(indicator));
}

/**
 * Response for when system is having issues
 */
export function getRecoveryResponse(errorType: string): string {
  const responses: Record<string, string> = {
    timeout: `Demorou um pouco para responder, mas estou aqui! 🏃
Pode repetir sua pergunta? 😊`,

    service_down: `Tive um problema conectando com meus dados, mas já estou resolvendo. 🔧
Tenta de novo em alguns segundos! ⏳`,

    database: `Tive um problema acessar seus dados. Não se preocupe, nada foi perdido! 🔒
Tenta de novo? 😊`,

    unknown: `Ops, algo deu errado da minha parte. Desculpa! 😅
Tenta enviar sua mensagem de novo? 🙏`,
  };

  return responses[errorType] || responses.unknown;
}
