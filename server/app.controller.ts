import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { StorageService } from './storage.service';

type RegisterBody = {
  name?: string;
  lastName?: string;
  email?: string;
  password?: string;
};

type LoginBody = {
  email?: string;
  password?: string;
};

type DeckBody = {
  cards?: unknown[];
};

type GenerateCardBody = {
  term?: string;
  userExample?: string;
  type?: string;
};

const TYPE_LABELS: Record<string, string> = {
  verb: 'Verb',
  noun: 'Noun',
  adjective: 'Adjective',
  adverb: 'Adverb',
  expression: 'Expression',
  phrasalVerb: 'Phrasal verb',
};

const POLLINATIONS_OPENAI_URL = 'https://text.pollinations.ai/openai';

function publicAccount(account: any) {
  if (!account) return null;
  const { password, ...rest } = account;
  return rest;
}

function parseAiJson(text: string) {
  const clean = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace >= 0 ? clean.slice(firstBrace, lastBrace + 1) : clean;
  return JSON.parse(jsonText);
}

function cardPrompt(term: string, userExample: string, type: string) {
  return `
You are an expert English learner-dictionary writer and dialogue creator.
Create realistic English-only content for a Spanish-speaking learner.

Vocabulary: "${term}"
Initial detected type: "${TYPE_LABELS[type] || type}"
Learner example/context: "${userExample}"

Rules:
- Infer the correct type from the learner example, not only from the spelling.
- Valid types are: verb, noun, adjective, adverb, expression, phrasalVerb.
- Explain the real meaning used in the learner example, like a learner dictionary.
- Include useful usage patterns or collocations when helpful.
- Do not give grammar-only meanings like "a noun used to name a person, thing, idea, event, or situation".
- Do not mention studying, flashcards, vocabulary, examples, or "the word".
- Create 2 useful examples that use "${term}" naturally.
- Create 2 different realistic conversations, each exactly 8 lines.
- Speakers must alternate Max and Kity.
- Each conversation must use "${term}" naturally at least twice.
- If "${term}" is a verb or phrasal verb, use correct grammar. Never write "it is pretty ${term}" unless the term is truly an adjective.
- Do not reuse a generic software/report/setup scene unless the learner example is actually about software.
- Return ONLY valid JSON with this exact shape:
{
  "type": "verb | noun | adjective | adverb | expression | phrasalVerb",
  "meaning": "clear learner-dictionary meaning with a short usage note",
  "examples": ["example 1", "example 2"],
  "conversations": [
    [{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."}],
    [{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."}]
  ]
}
`;
}

async function generateWithGemini(prompt: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Gemini API key is not configured');

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) throw new Error(`Gemini generation failed: ${response.status}`);
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || '').join('') || '';
  return parseAiJson(text);
}

async function generateWithPollinations(prompt: string) {
  const response = await fetch(POLLINATIONS_OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      temperature: 0.9,
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON. Create context-specific learner dictionary content and realistic dialogue.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Pollinations generation failed: ${response.status}`);
  const payload = await response.json();
  return parseAiJson(payload?.choices?.[0]?.message?.content || '');
}

@Controller('api')
export class AppController {
  constructor(@Inject(StorageService) private readonly storage: StorageService) {}

  @Get('health')
  health() {
    return { ok: true, redis: this.storage.isRedisEnabled(), framework: 'nestjs' };
  }

  @Post('register')
  async register(@Body() body: RegisterBody) {
    const normalizedEmail = String(body.email || '').trim().toLowerCase();

    if (!body.name || !body.lastName || !normalizedEmail || !body.password) {
      throw new BadRequestException('Missing required account fields.');
    }

    const existing = await this.storage.getAccount(normalizedEmail);
    if (existing) {
      throw new ConflictException('This email already has an account.');
    }

    const account = {
      name: String(body.name).trim(),
      lastName: String(body.lastName).trim(),
      email: normalizedEmail,
      password: String(body.password),
      createdAt: Date.now(),
    };

    await this.storage.saveAccount(account);
    await this.storage.saveDeck(normalizedEmail, []);

    return { account: publicAccount(account) };
  }

  @Post('login')
  async login(@Body() body: LoginBody) {
    const normalizedEmail = String(body.email || '').trim().toLowerCase();
    const account = await this.storage.getAccount(normalizedEmail);

    if (!account || account.password !== String(body.password || '')) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return { account: publicAccount(account) };
  }

  @Get('deck/:email')
  async getDeck(@Param('email') email: string) {
    const cards = await this.storage.getDeck(email);
    return { cards };
  }

  @Put('deck/:email')
  async saveDeck(@Param('email') email: string, @Body() body: DeckBody) {
    const cards = Array.isArray(body.cards) ? body.cards : [];
    await this.storage.saveDeck(email, cards);
    return { ok: true };
  }

  @Post('generate-card')
  async generateCard(@Body() body: GenerateCardBody) {
    const term = String(body.term || '').trim();
    const userExample = String(body.userExample || '').trim();
    const type = String(body.type || 'noun').trim();

    if (!term || !userExample) {
      throw new BadRequestException('Term and example are required.');
    }

    const prompt = cardPrompt(term, userExample, type);
    const providers = process.env.GEMINI_API_KEY ? ['gemini', 'pollinations'] : ['pollinations'];

    for (const provider of providers) {
      try {
        const card = provider === 'gemini' ? await generateWithGemini(prompt) : await generateWithPollinations(prompt);
        return { ...card, provider };
      } catch {
        // Try the next provider before reporting failure.
      }
    }

    throw new BadGatewayException('AI generation is unavailable.');
  }
}
