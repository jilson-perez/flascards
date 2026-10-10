import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Database,
  FlipHorizontal2,
  Info,
  Layers3,
  LogOut,
  Mail,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
  X,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'english-flashcards-v1';
const ACCOUNTS_KEY = 'english-flashcards-accounts-v1';
const SESSION_KEY = 'english-flashcards-session-v1';
const REMEMBER_KEY = 'english-flashcards-remember-v1';
const CAMBRIDGE_BASE_URL = '/cambridge';
const POLLINATIONS_OPENAI_URL = 'https://text.pollinations.ai/openai';
const cambridgeAudioCache = new Map();
const cambridgeEntryCache = new Map();
let activeAudio = null;

const TYPE_LABELS = {
  verb: 'Verb',
  noun: 'Noun',
  adjective: 'Adjective',
  adverb: 'Adverb',
  expression: 'Expression',
  phrasalVerb: 'Phrasal verb',
};

const DIFFICULTY = {
  easy: { label: 'Got it', weight: 1, nextIn: 8 },
  medium: { label: 'Almost', weight: 3, nextIn: 3 },
  hard: { label: 'Again', weight: 6, nextIn: 1 },
};

const phrasalParticles = new Set([
  'about',
  'across',
  'after',
  'around',
  'away',
  'back',
  'by',
  'down',
  'for',
  'in',
  'into',
  'off',
  'on',
  'out',
  'over',
  'through',
  'to',
  'up',
  'with',
]);

const commonVerbs = new Set([
  'accept',
  'add',
  'agree',
  'ask',
  'be',
  'become',
  'begin',
  'bring',
  'build',
  'buy',
  'call',
  'change',
  'check',
  'choose',
  'come',
  'create',
  'do',
  'drive',
  'eat',
  'find',
  'finish',
  'get',
  'give',
  'go',
  'grow',
  'have',
  'help',
  'keep',
  'know',
  'learn',
  'leave',
  'let',
  'look',
  'make',
  'move',
  'need',
  'open',
  'play',
  'put',
  'read',
  'run',
  'say',
  'see',
  'send',
  'show',
  'speak',
  'start',
  'study',
  'take',
  'talk',
  'think',
  'try',
  'turn',
  'use',
  'wait',
  'walk',
  'want',
  'work',
  'write',
]);

const commonNouns = new Set([
  'advice',
  'answer',
  'book',
  'business',
  'choice',
  'city',
  'conversation',
  'day',
  'decision',
  'idea',
  'job',
  'language',
  'meeting',
  'money',
  'person',
  'plan',
  'problem',
  'question',
  'reason',
  'story',
  'time',
  'work',
]);

const starterCards = [
  buildCard('figure out'),
  buildCard('reliable'),
  buildCard('deadline'),
  buildCard('catch up'),
];

function normalizeTerm(value) {
  return value.trim().replace(/\s+/g, ' ');
}

function titleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function classifyTerm(term) {
  const lower = term.toLowerCase();
  const words = lower.split(' ');
  const secondWord = words[1];

  if (words.length > 1 && phrasalParticles.has(secondWord)) return 'phrasalVerb';
  if (words.length > 2) return 'expression';
  if (commonVerbs.has(lower) || lower.endsWith('ize') || lower.endsWith('ate') || lower.endsWith('fy')) {
    return 'verb';
  }
  if (commonNouns.has(lower) || lower.endsWith('tion') || lower.endsWith('ment') || lower.endsWith('ness')) {
    return 'noun';
  }
  if (lower.endsWith('ly')) return 'adverb';
  if (
    lower.endsWith('able') ||
    lower.endsWith('ible') ||
    lower.endsWith('ous') ||
    lower.endsWith('ful') ||
    lower.endsWith('ive') ||
    lower.endsWith('al')
  ) {
    return 'adjective';
  }

  return words.length > 1 ? 'expression' : 'noun';
}

function examplesFor(term, type, userExample = '') {
  const word = term.toLowerCase();
  const readable = titleCase(term);
  const cleanExample = normalizeTerm(userExample);

  if (cleanExample) {
    return [
      cleanExample,
      `In a similar situation, I would use "${word}" to make the idea clearer and more natural.`,
    ];
  }

  if (type === 'phrasalVerb') {
    return [
      `I need to ${word} the answer before the meeting.`,
      `She helped me ${word} what happened yesterday.`,
    ];
  }

  if (type === 'verb') {
    return [
      `I try to ${word} a little English every day.`,
      `He will ${word} it again until it feels natural.`,
    ];
  }

  if (type === 'adjective') {
    return [
      `That is a ${word} option for this situation.`,
      `The explanation sounded ${word} and easy to understand.`,
    ];
  }

  if (type === 'adverb') {
    return [
      `She answered ${word} during the interview.`,
      `Try to say it ${word} when you practice.`,
    ];
  }

  if (type === 'expression') {
    return [
      `"${readable}" is useful in casual conversations.`,
      `I heard "${word}" in a movie and wrote it down.`,
    ];
  }

  return [
    `This ${word} is important for my daily English.`,
    `I wrote down the ${word} so I can remember it later.`,
  ];
}

function meaningFor(term, type, userExample = '') {
  const lower = term.toLowerCase();
  const cleanExample = normalizeTerm(userExample);
  const context = cleanExample ? ` In your example, "${cleanExample}", it is used in this specific situation.` : '';

  if (lower === 'deadline') {
    return `A deadline is the time or date by which something must be finished or submitted. You often meet a deadline, miss a deadline, or work under a tight deadline.${context}`;
  }

  if (lower === 'straightforward') {
    return `Straightforward means clear, simple, and easy to understand or do, without unnecessary difficulty. It is often used for instructions, processes, explanations, or tasks.${context}`;
  }

  if (type === 'phrasalVerb') {
    return `To ${lower} means to do the action expressed by this phrasal verb in context. The meaning can change depending on the situation, so focus on the full sentence and what is happening.${context}`;
  }
  if (type === 'verb') {
    return `To ${lower} means to perform this action in a real situation. Pay attention to who does the action, what receives the action, and why it happens.${context}`;
  }
  if (type === 'adjective') {
    return `${titleCase(term)} describes a quality or condition of a person, thing, process, or situation. It tells you what that thing is like in context.${context}`;
  }
  if (type === 'adverb') {
    return `${titleCase(term)} explains how an action happens. It usually gives more detail about the manner, speed, attitude, or degree of an action.${context}`;
  }
  if (type === 'expression') {
    return `${titleCase(term)} is an expression used to communicate a complete idea naturally in conversation. Its exact meaning depends on the situation around it.${context}`;
  }
  return `${titleCase(term)} is used to talk about a specific thing, idea, event, or situation. In real English, notice the verbs and adjectives that commonly appear with it.${context}`;
}

function conversationExamples(term, type, userExample = '') {
  const word = term.toLowerCase();
  const cleanExample = normalizeTerm(userExample);
  const scenario = cleanExample || `We need to use ${word} in a normal situation.`;

  if (cleanExample) {
    return [
      [
        { speaker: 'Max', line: 'Have you tried the new software yet?' },
        { speaker: 'Kity', line: `Yes, I used it this morning. It was pretty ${word}.` },
        { speaker: 'Max', line: 'Really? I thought creating the report would be confusing.' },
        { speaker: 'Kity', line: 'Not at all. You choose a date range and click Generate.' },
        { speaker: 'Max', line: 'That sounds easier than I expected.' },
        { speaker: 'Kity', line: `Exactly. The process is ${word} once you know where everything is.` },
        { speaker: 'Max', line: 'Could you show me after lunch?' },
        { speaker: 'Kity', line: 'Sure. It will only take a few minutes.' },
      ],
      [
        { speaker: 'Max', line: `I read this sentence earlier: "${scenario}"` },
        { speaker: 'Kity', line: 'That makes sense in a work conversation.' },
        { speaker: 'Max', line: `Could I say the instructions are ${word}?` },
        { speaker: 'Kity', line: 'Yes, especially if they are clear and easy to follow.' },
        { speaker: 'Max', line: 'Good. I want to use it when I explain the app to Daniel.' },
        { speaker: 'Kity', line: `Then say, "The setup is ${word}, so you can finish it quickly."` },
        { speaker: 'Max', line: 'Perfect. That sounds natural.' },
        { speaker: 'Kity', line: 'It does. Use it when something feels simple and direct.' },
      ],
    ];
  }

  if (type === 'phrasalVerb') {
    return [
      [
        { speaker: 'Max', line: `I cannot ${word} why the report keeps changing.` },
        { speaker: 'Kity', line: 'Start with the numbers from yesterday and compare them one by one.' },
        { speaker: 'Max', line: `Good idea. If I ${word} the mistake today, we can send the final version.` },
        { speaker: 'Kity', line: 'Exactly. Then the meeting tomorrow will be much easier.' },
        { speaker: 'Max', line: 'I will check the sales tab first.' },
        { speaker: 'Kity', line: 'And I will review the formulas in the summary.' },
        { speaker: 'Max', line: `Great. We should ${word} the issue before lunch.` },
        { speaker: 'Kity', line: 'Then we can focus on the presentation.' },
      ],
      [
        { speaker: 'Max', line: `Did you ${word} how to use the new app?` },
        { speaker: 'Kity', line: 'Yes, but it took me a few minutes to understand the settings.' },
        { speaker: 'Max', line: `I am still trying to ${word} the pronunciation tool.` },
        { speaker: 'Kity', line: 'Click the audio button first, then repeat the sentence out loud.' },
        { speaker: 'Max', line: 'Oh, now I see the US and UK options.' },
        { speaker: 'Kity', line: 'Exactly. Try both and notice the difference.' },
        { speaker: 'Max', line: `Nice, I finally ${word} how it works.` },
        { speaker: 'Kity', line: 'Good. Now use it with your next card.' },
      ],
    ];
  }

  if (type === 'verb') {
    return [
      [
        { speaker: 'Max', line: `I need to ${word} this before lunch.` },
        { speaker: 'Kity', line: 'Do the most important part first and leave the small details for later.' },
        { speaker: 'Max', line: `If I ${word} it now, I will have more time to practice English tonight.` },
        { speaker: 'Kity', line: 'That sounds like a solid plan.' },
        { speaker: 'Max', line: 'Can you review it when I finish?' },
        { speaker: 'Kity', line: 'Sure, send it to me before the meeting.' },
        { speaker: 'Max', line: `Thanks. I will ${word} the final version after your comments.` },
        { speaker: 'Kity', line: 'Perfect. Then we can send it to the team.' },
      ],
      [
        { speaker: 'Max', line: `Can you show me how to ${word} this naturally in a sentence?` },
        { speaker: 'Kity', line: 'Sure. Think about a normal situation from your day.' },
        { speaker: 'Max', line: `Okay, I will ${word} it with an example from work.` },
        { speaker: 'Kity', line: 'Perfect. Real context makes it easier to remember.' },
        { speaker: 'Max', line: 'What if I use it in a meeting?' },
        { speaker: 'Kity', line: 'That works. Keep the sentence short and clear.' },
        { speaker: 'Max', line: `Great, I will ${word} it when I explain the task.` },
        { speaker: 'Kity', line: 'That will sound natural.' },
      ],
    ];
  }

  return [
    [
      { speaker: 'Max', line: 'Have you tried the new software yet?' },
      { speaker: 'Kity', line: `Yes, I used it this morning. It is pretty ${word}.` },
      { speaker: 'Max', line: 'Was it difficult? I am still getting used to it.' },
      { speaker: 'Kity', line: 'Not really. Everything is easy to find.' },
      { speaker: 'Max', line: 'Could you show me how to create a report?' },
      { speaker: 'Kity', line: 'Sure. Choose a date range, then click Generate.' },
      { speaker: 'Max', line: `Oh, that is more ${word} than I expected.` },
      { speaker: 'Kity', line: 'Exactly. You will get the hang of it quickly.' },
    ],
    [
      { speaker: 'Max', line: 'Do you think the client will understand the proposal?' },
      { speaker: 'Kity', line: `Yes. The design is ${word}, and the steps are clear.` },
      { speaker: 'Max', line: 'Good. I do not want them to feel lost during the demo.' },
      { speaker: 'Kity', line: 'Start with the problem, then show the solution.' },
      { speaker: 'Max', line: 'Should I skip the technical details?' },
      { speaker: 'Kity', line: `Mention them briefly, but keep the explanation ${word}.` },
      { speaker: 'Max', line: 'That makes sense.' },
      { speaker: 'Kity', line: 'They will ask for details if they need them.' },
    ],
  ];
}

function buildCard(term, userExample = '') {
  const normalized = normalizeTerm(term);
  const example = normalizeTerm(userExample);
  const type = classifyTerm(normalized);

  return {
    id: crypto.randomUUID(),
    term: normalized,
    type,
    userExample: example,
    meaning: meaningFor(normalized, type, example),
    examples: examplesFor(normalized, type, example),
    conversations: conversationExamples(normalized, type, example),
    difficulty: 'medium',
    reviews: 0,
    score: 0,
    nextReviewAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function parseAiJson(text) {
  const clean = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  const jsonText = firstBrace >= 0 && lastBrace >= 0 ? clean.slice(firstBrace, lastBrace + 1) : clean;
  return JSON.parse(jsonText);
}

function hasMetaConversation(conversations) {
  const blockedPatterns = [
    /\b(the )?word\b/i,
    /\bvocabulary\b/i,
    /\bflashcard\b/i,
    /\bcard\b/i,
    /\bpractice\b/i,
    /\blearn(ing)?\b/i,
    /\bexample\b/i,
    /\bstudy\b/i,
  ];

  return conversations.some((conversation) =>
    conversation.some((line) => blockedPatterns.some((pattern) => pattern.test(line.line || ''))),
  );
}

function isWeakMeaning(meaning) {
  return /noun used to name|verb means to perform this action|describes the quality|used as a complete idea/i.test(meaning);
}

async function generateAiCardData(term, userExample, type) {
  const prompt = `
You are helping a Spanish-speaking learner study English vocabulary.
Create realistic English-only study content for this vocabulary card.

Vocabulary: "${term}"
Type: "${TYPE_LABELS[type]}"
Learner example/context: "${userExample}"

Rules:
- The meaning must be educational and context-aware, similar to a learner dictionary.
- The meaning must explain what "${term}" means in the learner's example/context.
- Include common usage patterns or collocations when useful, such as "meet a deadline", "miss a deadline", "tight deadline".
- Do not give generic grammar-only meanings like "a noun used to name a person, thing, idea, event, or situation".
- Do not simply repeat the learner example as the meaning.
- Do not write meta sentences like "I learn the word water".
- Do not mention studying, practicing, vocabulary, cards, examples, or "the word".
- Use the vocabulary naturally in real situations.
- The conversation must be a realistic scene, not an explanation about language learning.
- The vocabulary must appear naturally in the dialogue at least twice.
- Keep the meaning clear and short.
- Make examples natural and useful.
- Make 2 conversations, each exactly 8 lines, with speakers Max and Kity.
- Each conversation must use "${term}" naturally in a realistic scenario.
- Good style example:
  Max: Have you tried the new software yet?
  Kity: Yes, I used it this morning to create a report.
  Max: Was it difficult? I’m still getting used to it.
  Kity: Not really. It’s pretty straightforward once you know where everything is.
- Return ONLY valid JSON with this shape:
{
  "meaning": "learner-dictionary style meaning with a short usage note",
  "examples": ["example 1", "example 2"],
  "conversations": [
    [{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."}],
    [{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."},{"speaker":"Max","line":"..."},{"speaker":"Kity","line":"..."}]
  ]
}
`;

  const response = await fetch(POLLINATIONS_OPENAI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'openai',
      messages: [
        {
          role: 'system',
          content: 'Return only valid JSON. Do not wrap the JSON in markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI generation failed: ${response.status}`);

  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content || '';
  const data = parseAiJson(text);

  if (!data.meaning || !Array.isArray(data.examples) || !Array.isArray(data.conversations)) {
    throw new Error('AI generation returned an invalid card shape');
  }

  const normalized = {
    meaning: String(data.meaning).trim(),
    examples: data.examples.slice(0, 2).map((example) => String(example).trim()).filter(Boolean),
    conversations: data.conversations.slice(0, 2).map((conversation) =>
      conversation.slice(0, 8).map((line, index) => ({
        speaker: line.speaker === 'Kity' || index % 2 === 1 ? 'Kity' : 'Max',
        line: String(line.line || '').trim(),
      })),
    ),
  };

  if (hasMetaConversation(normalized.conversations)) {
    throw new Error('AI generated meta conversation instead of real dialogue');
  }

  if (isWeakMeaning(normalized.meaning)) {
    normalized.meaning = meaningFor(term, type, userExample);
  }

  return normalized;
}

function cloneStarterDeck() {
  return starterCards.map((card) => ({ ...card, id: crypto.randomUUID(), nextReviewAt: Date.now() }));
}

function accountDeckKey(email) {
  return `${STORAGE_KEY}:${email.toLowerCase()}`;
}

function loadAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function loadRememberedAuth() {
  try {
    return JSON.parse(localStorage.getItem(REMEMBER_KEY)) || { email: '', password: '', remember: true };
  } catch {
    return { email: '', password: '', remember: true };
  }
}

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

function saveSession(account, remember) {
  if (remember) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: account.email, password: account.password, remember }));
    return;
  }

  sessionStorage.setItem(SESSION_KEY, JSON.stringify(account));
  localStorage.removeItem(SESSION_KEY);
  localStorage.setItem(REMEMBER_KEY, JSON.stringify({ email: account.email, password: '', remember }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

function activeSession() {
  return loadSession() || JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'API request failed');
  return payload;
}

function isApiUnavailable(error) {
  const message = String(error?.message || '');
  return message.includes('Failed to fetch') || message.includes('API request failed');
}

function loadCards(email) {
  if (!email) return [];

  try {
    const saved = JSON.parse(localStorage.getItem(accountDeckKey(email)));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveCards(cards, email) {
  if (!email) return;
  localStorage.setItem(accountDeckKey(email), JSON.stringify(cards));
}

async function loadCardsFromApi(email) {
  const payload = await apiRequest(`/api/deck/${encodeURIComponent(email)}`);
  return Array.isArray(payload.cards) ? payload.cards : [];
}

async function saveCardsToApi(cards, email) {
  await apiRequest(`/api/deck/${encodeURIComponent(email)}`, {
    method: 'PUT',
    body: JSON.stringify({ cards }),
  });
}

function weightedPick(cards) {
  if (!cards.length) return null;

  const dueCards = cards.filter((card) => card.nextReviewAt <= Date.now());
  const pool = dueCards.length ? dueCards : cards;
  const expanded = pool.flatMap((card) => Array(DIFFICULTY[card.difficulty].weight).fill(card));
  return expanded[Math.floor(Math.random() * expanded.length)];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightTerm(example, term) {
  const parts = example.split(new RegExp(`(${escapeRegExp(term)})`, 'ig'));

  return parts.map((part, index) =>
    part.toLowerCase() === term.toLowerCase() ? <strong key={`${part}-${index}`}>{part}</strong> : part,
  );
}

function decodeHtml(value) {
  const element = document.createElement('textarea');
  element.innerHTML = value;
  return element.value;
}

function stripHtml(value) {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function cambridgeSlug(term) {
  return term
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');
}

function extractIpa(html, region) {
  const regionMatch = html.match(new RegExp(`<span class="${region} dpron-i[\\s\\S]*?<span class="ipa[^"]*">([^<]+)<\\/span>`, 'i'));
  if (regionMatch?.[1]) return `/${decodeHtml(regionMatch[1])}/`;

  const firstIpa = html.match(/<span class="ipa[^"]*">([^<]+)<\/span>/i);
  return firstIpa?.[1] ? `/${decodeHtml(firstIpa[1])}/` : '';
}

function extractDefinition(html) {
  const definitionMatch = html.match(/<div class="def ddef_d db">([\s\S]*?)<\/div>/i);
  return definitionMatch?.[1] ? stripHtml(definitionMatch[1]).replace(/\s+:/, ':') : '';
}

function extractExamples(html) {
  const matches = [...html.matchAll(/<span class="eg deg">([\s\S]*?)<\/span>/gi)]
    .map((match) => stripHtml(match[1]))
    .filter(Boolean);

  return [...new Set(matches)].slice(0, 2);
}

async function fetchCambridgeEntry(term) {
  const cacheKey = term.toLowerCase();
  if (cambridgeEntryCache.has(cacheKey)) return cambridgeEntryCache.get(cacheKey);

  try {
    const response = await fetch(`/cambridge/dictionary/english/${cambridgeSlug(term)}`);
    if (!response.ok) throw new Error(`Cambridge lookup failed: ${response.status}`);

    const html = await response.text();
    const entry = {
      ipa: {
        uk: extractIpa(html, 'uk'),
        us: extractIpa(html, 'us'),
      },
      definition: extractDefinition(html),
      examples: extractExamples(html),
      audio: {
        uk: [...new Set(html.match(/\/media\/english\/uk_pron\/[^"'\s<>]+?\.mp3/g) || [])].map(
          (path) => `${CAMBRIDGE_BASE_URL}${path}`,
        ),
        us: [...new Set(html.match(/\/media\/english\/us_pron\/[^"'\s<>]+?\.mp3/g) || [])].map(
          (path) => `${CAMBRIDGE_BASE_URL}${path}`,
        ),
      },
    };

    cambridgeEntryCache.set(cacheKey, entry);
    return entry;
  } catch {
    const emptyEntry = { ipa: { uk: '', us: '' }, definition: '', examples: [], audio: { uk: [], us: [] } };
    cambridgeEntryCache.set(cacheKey, emptyEntry);
    return emptyEntry;
  }
}

function mediaPathFor(word, region) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return null;

  const first = clean.slice(0, 1);
  const firstThree = clean.slice(0, 3).padEnd(3, '_');
  const firstFive = clean.slice(0, 5).padEnd(5, '_');

  return `${CAMBRIDGE_BASE_URL}/media/english/${region}_pron/${first}/${firstThree}/${firstFive}/${clean}.mp3`;
}

function generatedCambridgeCandidates(term, locale) {
  const region = locale === 'en-GB' ? 'uk' : 'us';
  if (region === 'uk') return [];

  const words = term
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z]/g, ''))
    .filter(Boolean);
  const compactTerm = words.join('');

  return [compactTerm, words[0]]
    .filter(Boolean)
    .map((word) => mediaPathFor(word, region))
    .filter(Boolean);
}

async function fetchCambridgeCandidates(term, locale) {
  const region = locale === 'en-GB' ? 'uk' : 'us';
  const cacheKey = `${region}:${term.toLowerCase()}`;

  if (cambridgeAudioCache.has(cacheKey)) return cambridgeAudioCache.get(cacheKey);

  const entry = await fetchCambridgeEntry(term);
  const candidates = [...entry.audio[region], ...generatedCambridgeCandidates(term, locale)];
  cambridgeAudioCache.set(cacheKey, candidates);
  return candidates;
}

function playAudioUrl(url) {
  return new Promise((resolve, reject) => {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }

    const audio = new Audio(url);
    activeAudio = audio;
    let settled = false;
    audio.preload = 'auto';

    const rejectIfCurrent = () => {
      if (settled) return;
      settled = true;
      if (activeAudio === audio) activeAudio = null;
      reject(new Error('Audio failed'));
    };
    const resolveIfCurrent = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = null;
    });
    audio.addEventListener('error', rejectIfCurrent, { once: true });
    audio.addEventListener('playing', resolveIfCurrent, { once: true });
    audio.addEventListener('canplaythrough', resolveIfCurrent, { once: true });
    audio.play().catch(rejectIfCurrent);
  });
}

async function speakWithCambridge(text, locale = 'en-US') {
  const candidates = await fetchCambridgeCandidates(text, locale);

  for (const url of candidates) {
    try {
      await playAudioUrl(url);
      return;
    } catch {
      // Try the next Cambridge candidate before falling back to browser speech.
    }
  }

  speak(text, locale);
}

function speak(text, locale = 'en-US') {
  if (!('speechSynthesis' in window)) return;

  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find((voice) => voice.lang === locale && /samantha|alex|daniel|google|microsoft/i.test(voice.name)) ||
    voices.find((voice) => voice.lang === locale) ||
    voices.find((voice) => voice.lang.startsWith(locale.slice(0, 2)));

  utterance.lang = locale;
  utterance.rate = 0.86;
  utterance.pitch = 1;
  if (preferredVoice) utterance.voice = preferredVoice;
  window.speechSynthesis.speak(utterance);
}

function App() {
  const rememberedAuth = loadRememberedAuth();
  const [auth, setAuth] = useState(activeSession);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authForm, setAuthForm] = useState({
    name: '',
    lastName: '',
    email: rememberedAuth.email || '',
    password: rememberedAuth.password || '',
    remember: rememberedAuth.remember !== false,
  });
  const [cards, setCards] = useState([]);
  const [term, setTerm] = useState('');
  const [example, setExample] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [deckReady, setDeckReady] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [isChanging, setIsChanging] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState('home');
  const [isFlipped, setIsFlipped] = useState(false);
  const [entryInfo, setEntryInfo] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  const groupedCards = useMemo(() => {
    return cards.reduce((groups, card) => {
      groups[card.type] = groups[card.type] || [];
      groups[card.type].push(card);
      return groups;
    }, {});
  }, [cards]);

  const filteredCards = useMemo(() => {
    return selectedType === 'all' ? cards : cards.filter((card) => card.type === selectedType);
  }, [cards, selectedType]);

  const activeCard = useMemo(() => {
    return filteredCards.find((card) => card.id === activeId) || weightedPick(filteredCards);
  }, [activeId, filteredCards]);

  const stats = useMemo(() => {
    return cards.reduce(
      (acc, card) => {
        acc[card.difficulty] += 1;
        return acc;
      },
      { easy: 0, medium: 0, hard: 0 },
    );
  }, [cards]);

  useEffect(() => {
    if (!deckReady) return;
    saveCards(cards, auth?.email);
    if (!auth?.email) return;
    saveCardsToApi(cards, auth.email).catch(() => {});
  }, [cards, auth?.email, deckReady]);

  useEffect(() => {
    let isCurrent = true;
    setDeckReady(false);
    const localCards = loadCards(auth?.email);
    setCards(localCards);
    setActiveId(null);
    setSelectedType('all');
    setViewMode('home');

    if (auth?.email) {
      loadCardsFromApi(auth.email)
        .then((remoteCards) => {
          if (isCurrent) setCards(remoteCards);
        })
        .catch(() => {
          if (isCurrent) setCards(localCards);
        })
        .finally(() => {
          if (isCurrent) setDeckReady(true);
        });
    } else {
      setDeckReady(true);
    }

    return () => {
      isCurrent = false;
    };
  }, [auth?.email]);

  useEffect(() => {
    if (activeCard && activeCard.id !== activeId) setActiveId(activeCard.id);
  }, [activeCard, activeId]);

  useEffect(() => {
    setIsFlipped(false);
  }, [activeCard?.id]);

  useEffect(() => {
    let isCurrent = true;
    setEntryInfo(null);

    if (!activeCard) return () => {};

    fetchCambridgeEntry(activeCard.term).then((entry) => {
      if (isCurrent) setEntryInfo(entry);
    });

    return () => {
      isCurrent = false;
    };
  }, [activeCard?.id, activeCard?.term]);

  function updateAuthForm(field, value) {
    setAuthForm((current) => ({ ...current, [field]: value }));
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError('');

    const email = authForm.email.trim().toLowerCase();
    const password = authForm.password.trim();
    const accounts = loadAccounts();

    if (!email || !password) {
      setAuthError('Email and password are required.');
      return;
    }

    if (authMode === 'register') {
      if (!authForm.name.trim() || !authForm.lastName.trim()) {
        setAuthError('Name and last name are required.');
        return;
      }

      if (accounts[email]) {
        setAuthError('This email already has an account. Try logging in.');
        setAuthMode('login');
        return;
      }

      const account = {
        name: authForm.name.trim(),
        lastName: authForm.lastName.trim(),
        email,
        password,
        createdAt: Date.now(),
      };

      try {
        await apiRequest('/api/register', {
          method: 'POST',
          body: JSON.stringify(account),
        });
      } catch (error) {
        if (!isApiUnavailable(error)) {
          setAuthError(error.message);
          return;
        }
      }

      saveAccounts({ ...accounts, [email]: account });
      saveSession(account, authForm.remember);
      setAuth(account);
      return;
    }

    let account = accounts[email];

    try {
      const payload = await apiRequest('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      account = { ...payload.account, password };
    } catch (error) {
      if (!isApiUnavailable(error)) {
        setAuthError(error.message);
        return;
      }

      if (!account || account.password !== password) {
        setAuthError('Email or password is incorrect.');
        return;
      }
    }

    saveAccounts({ ...accounts, [email]: account });
    saveSession(account, authForm.remember);
    setAuth(account);
  }

  function logout() {
    clearSession();
    setAuth(null);
    setCards([]);
    setViewMode('home');
  }

  async function addCard(event) {
    event.preventDefault();
    const normalized = normalizeTerm(term);
    const normalizedExample = normalizeTerm(example);
    if (!normalized || !normalizedExample || isGenerating) return;

    const exists = cards.some((card) => card.term.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setTerm('');
      setExample('');
      return;
    }

    const nextCard = buildCard(normalized, normalizedExample);
    setIsGenerating(true);

    try {
      const aiData = await generateAiCardData(nextCard.term, normalizedExample, nextCard.type);
      nextCard.meaning = aiData.meaning || nextCard.meaning;
      nextCard.examples = aiData.examples.length ? aiData.examples : nextCard.examples;
      nextCard.conversations = aiData.conversations.length ? aiData.conversations : nextCard.conversations;
      nextCard.aiGenerated = true;
    } catch {
      nextCard.aiGenerated = false;
    }

    setCards((current) => [nextCard, ...current]);
    setActiveId(nextCard.id);
    setTerm('');
    setExample('');
    setIsGenerating(false);
    window.setTimeout(() => speakWithCambridge(nextCard.term, 'en-US'), 150);
  }

  async function regenerateActiveCard() {
    if (!activeCard || isGenerating) return;

    setIsGenerating(true);
    const regeneratedCard = buildCard(activeCard.term, activeCard.userExample || activeCard.examples?.[0] || '');

    try {
      const aiData = await generateAiCardData(activeCard.term, activeCard.userExample || activeCard.examples?.[0] || '', activeCard.type);
      regeneratedCard.meaning = aiData.meaning || regeneratedCard.meaning;
      regeneratedCard.examples = aiData.examples.length ? aiData.examples : regeneratedCard.examples;
      regeneratedCard.conversations = aiData.conversations.length ? aiData.conversations : regeneratedCard.conversations;
      regeneratedCard.aiGenerated = true;
    } catch {
      regeneratedCard.aiGenerated = false;
    }

    setCards((current) =>
      current.map((card) =>
        card.id === activeCard.id
          ? {
              ...card,
              meaning: regeneratedCard.meaning,
              examples: regeneratedCard.examples,
              conversations: regeneratedCard.conversations,
              aiGenerated: regeneratedCard.aiGenerated,
              updatedAt: Date.now(),
            }
          : card,
      ),
    );
    setIsGenerating(false);
    setIsFlipped(true);
  }

  function showNext() {
    setIsChanging(true);
    window.setTimeout(() => {
      const candidates = filteredCards.filter((card) => card.id !== activeCard?.id);
      const next = weightedPick(candidates.length ? candidates : filteredCards);
      setActiveId(next?.id || null);
      setIsChanging(false);
    }, 220);
  }

  function markDifficulty(difficulty) {
    if (!activeCard) return;

    setCards((current) =>
      current.map((card) => {
        if (card.id !== activeCard.id) return card;
        const nextIn = DIFFICULTY[difficulty].nextIn * 60 * 60 * 1000;
        return {
          ...card,
          difficulty,
          reviews: card.reviews + 1,
          score: card.score + (difficulty === 'easy' ? 2 : difficulty === 'medium' ? 1 : 0),
          nextReviewAt: Date.now() + nextIn,
          updatedAt: Date.now(),
        };
      }),
    );
    showNext();
  }

  function removeCard(id) {
    const card = cards.find((item) => item.id === id);
    const confirmed = window.confirm(`Delete "${card?.term || 'this card'}" from your deck?`);
    if (!confirmed) return;

    setCards((current) => current.filter((card) => card.id !== id));
    showNext();
  }

  function resetDeck() {
    setCards(cloneStarterDeck());
    setSelectedType('all');
    setActiveId(null);
  }

  function renderPronunciationButtons(card) {
    return (
      <div className="pronunciation-buttons" aria-label="Pronunciation options">
        <button className="icon-button language-button" onClick={() => speakWithCambridge(card.term, 'en-US')} title="US pronunciation">
          <Volume2 size={19} />
          <span>US</span>
        </button>
        <button className="icon-button language-button" onClick={() => speakWithCambridge(card.term, 'en-GB')} title="UK pronunciation">
          <Volume2 size={19} />
          <span>UK</span>
        </button>
      </div>
    );
  }

  function renderFlashcard() {
    const meaning =
      activeCard?.meaning ||
      entryInfo?.definition ||
      meaningFor(activeCard?.term || '', activeCard?.type || 'noun', activeCard?.userExample || '');
    const shortExamples = activeCard?.examples?.length ? activeCard.examples : entryInfo?.examples || [];
    const conversations =
      activeCard?.conversations ||
      conversationExamples(activeCard?.term || '', activeCard?.type || 'noun', activeCard?.userExample || '');
    return (
      <section className={`flashcard ${isChanging ? 'leaving' : 'entering'}`} aria-live="polite">
        {activeCard ? (
          <>
            <div className={`flip-surface ${isFlipped ? 'is-flipped' : ''}`}>
              {!isFlipped ? (
                <div className="flash-face flash-front" key="front">
                  <div className="card-header">
                    <span className={`type-badge ${activeCard.type}`}>{TYPE_LABELS[activeCard.type]}</span>
                  </div>

                  <div className="card-main front-main">
                    <p className="term">{activeCard.term}</p>
                    {renderPronunciationButtons(activeCard)}
                  </div>
                </div>
              ) : (
                <div className="flash-face flash-back" key="back">
                  <div className="card-header">
                    <span className={`type-badge ${activeCard.type}`}>{TYPE_LABELS[activeCard.type]}</span>
                  </div>

                  <div className="back-content">
                    <div className="meaning-block">
                      <h2>Meaning</h2>
                      <p>{meaning}</p>
                    </div>

                    <div className="examples">
                      <h2>Examples</h2>
                      {shortExamples.map((example) => (
                        <p key={example}>{highlightTerm(example, activeCard.term)}</p>
                      ))}
                    </div>

                    <div className="dialogues">
                      <h2>Conversation</h2>
                      {conversations.map((conversation, index) => (
                        <div className="dialogue" key={`dialogue-${index}`}>
                          {conversation.map((line) => (
                            <p key={`${line.speaker}-${line.line}`}>
                              <strong>{line.speaker}:</strong> {highlightTerm(line.line, activeCard.term)}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button className="flip-button" onClick={() => setIsFlipped(!isFlipped)}>
              <FlipHorizontal2 size={18} />
              {isFlipped ? 'Back to word' : 'See meaning'}
            </button>

            <div className="actions" aria-label="Difficulty choices">
              <button className="easy" onClick={() => markDifficulty('easy')}>
                <CheckCircle2 size={19} />
                Got it
              </button>
              <button className="medium" onClick={() => markDifficulty('medium')}>
                <Brain size={19} />
                Almost
              </button>
              <button className="hard" onClick={() => markDifficulty('hard')}>
                <Sparkles size={19} />
                Again
              </button>
            </div>

            <div className="card-footer">
              <button onClick={showNext}>
                <Shuffle size={18} />
                Random card
              </button>
              <button onClick={regenerateActiveCard} disabled={isGenerating}>
                <Sparkles size={18} />
                {isGenerating ? 'Generating' : 'Regenerate'}
              </button>
              <button onClick={() => removeCard(activeCard.id)}>
                <Trash2 size={18} />
                Delete
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <BookOpen size={42} />
            <h2>No cards yet</h2>
            <p>Add your first English word, verb, noun, expression, or phrasal verb.</p>
          </div>
        )}
      </section>
    );
  }

  function renderHome() {
    return (
      <section className="home-panel">
        <div className="home-copy">
          <p className="eyebrow">English study deck</p>
          <h1>Build vocabulary you can actually use</h1>
          <p>
            Practice first, review meaning when you need it, and keep adding words with your own real examples.
          </p>
        </div>

        <div className="home-actions">
          <button className="home-card primary" onClick={() => setViewMode('study')}>
            <BookOpen size={24} />
            <span>
              <strong>Study</strong>
              Focus on flashcards, audio, and recall.
            </span>
          </button>
          <button className="home-card" onClick={() => setViewMode('admin')}>
            <Settings2 size={24} />
            <span>
              <strong>Admin</strong>
              Add vocabulary, examples, filters, and deck management.
            </span>
          </button>
        </div>

        <div className="home-stats" aria-label="Deck summary">
          <div>
            <span>{cards.length}</span>
            Cards
          </div>
          <div>
            <span>{stats.hard}</span>
            Again
          </div>
          <div>
            <span>{stats.medium}</span>
            Almost
          </div>
          <div>
            <span>{stats.easy}</span>
            Got it
          </div>
        </div>
      </section>
    );
  }

  function renderAuth() {
    return (
      <main className="auth-shell">
        <section className="auth-panel">
          <div className="auth-copy">
            <p className="eyebrow">English study deck</p>
            <h1>Your vocabulary, one account</h1>
            <p>
              Create a simple profile so your deck is separated by email. Real cross-device sync is ready for a backend or cloud adapter.
            </p>
          </div>

          <form className="auth-form" onSubmit={submitAuth}>
            <div className="auth-tabs" role="tablist" aria-label="Account mode">
              <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                Log in
              </button>
              <button type="button" className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>
                Register
              </button>
            </div>

            {authMode === 'register' && (
              <div className="auth-grid">
                <label>
                  Name
                  <input value={authForm.name} onChange={(event) => updateAuthForm('name', event.target.value)} autoComplete="given-name" />
                </label>
                <label>
                  Last name
                  <input value={authForm.lastName} onChange={(event) => updateAuthForm('lastName', event.target.value)} autoComplete="family-name" />
                </label>
              </div>
            )}

            <label>
              Email
              <div className="auth-input">
                <Mail size={18} />
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => updateAuthForm('email', event.target.value)}
                  autoComplete="email"
                />
              </div>
            </label>

            <label>
              Password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => updateAuthForm('password', event.target.value)}
                autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              />
            </label>

            <label className="remember-row">
              <input
                type="checkbox"
                checked={authForm.remember}
                onChange={(event) => updateAuthForm('remember', event.target.checked)}
              />
              Remember my password on this device
            </label>

            {authError && <p className="auth-error">{authError}</p>}

            <button className="auth-submit" type="submit">
              <UserRound size={18} />
              {authMode === 'register' ? 'Create account' : 'Enter app'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (!auth) return renderAuth();

  return (
    <main className={`app-shell ${viewMode === 'study' ? 'study-only' : ''} ${viewMode === 'home' ? 'home-mode' : 'admin-mode'}`}>
      <nav className="mode-switch" aria-label="App mode">
        <button className={viewMode === 'home' ? 'active' : ''} onClick={() => setViewMode('home')}>
          <Sparkles size={17} />
          Home
        </button>
        <button className={viewMode === 'study' ? 'active' : ''} onClick={() => setViewMode('study')}>
          <BookOpen size={17} />
          Study
        </button>
        <button className={viewMode === 'admin' ? 'active' : ''} onClick={() => setViewMode('admin')}>
          <Settings2 size={17} />
          Admin
        </button>
        <button onClick={logout} title="Log out">
          <LogOut size={17} />
          Exit
        </button>
      </nav>

      <button className="about-fab" type="button" onClick={() => setAboutOpen(true)} title="About">
        <Info size={17} />
        <span>About</span>
      </button>

      {viewMode === 'home' ? (
        renderHome()
      ) : viewMode === 'study' ? (
        <section className="focus-stage">{renderFlashcard()}</section>
      ) : (
        <>
      <section className="study-panel">
        <header className="topbar">
          <div>
            <p className="eyebrow">English study deck</p>
            <h1>Flashcards that learn with you</h1>
          </div>
          <div className="storage-pill" title="Frontend-only storage">
            <Database size={18} />
            Local NoSQL
          </div>
        </header>

        <form className="add-form" onSubmit={addCard}>
          <div className="add-fields">
            <label htmlFor="new-term">
              Word or expression
              <input
                id="new-term"
                value={term}
                onChange={(event) => setTerm(event.target.value)}
                placeholder="try: give up, reliable, deadline..."
                autoComplete="off"
              />
            </label>
            <label htmlFor="new-example">
              Your example
              <textarea
                id="new-example"
                value={example}
                onChange={(event) => setExample(event.target.value)}
                placeholder="Write a sentence where you saw it or want to use it..."
                rows={3}
              />
            </label>
          </div>
          <div className="input-row add-submit-row">
            <button type="submit" disabled={isGenerating}>
              <Plus size={19} />
              {isGenerating ? 'Generating...' : 'Build card'}
            </button>
          </div>
        </form>

        <div className="filters" aria-label="Card filters">
          <button className={selectedType === 'all' ? 'active' : ''} onClick={() => setSelectedType('all')}>
            All
          </button>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              className={selectedType === type ? 'active' : ''}
              onClick={() => setSelectedType(type)}
              disabled={!groupedCards[type]}
            >
              {label}
            </button>
          ))}
        </div>

        {renderFlashcard()}
      </section>

      <aside className="deck-panel">
        <div className="metric-grid">
          <div>
            <span>{cards.length}</span>
            Cards
          </div>
          <div>
            <span>{stats.hard}</span>
            Again
          </div>
          <div>
            <span>{stats.medium}</span>
            Almost
          </div>
          <div>
            <span>{stats.easy}</span>
            Got it
          </div>
        </div>

        <section className="group-list">
          <div className="section-title">
            <Layers3 size={18} />
            Groups
          </div>
          {Object.entries(TYPE_LABELS).map(([type, label]) => (
            <button key={type} onClick={() => setSelectedType(type)} disabled={!groupedCards[type]}>
              <span>{label}</span>
              <strong>{groupedCards[type]?.length || 0}</strong>
            </button>
          ))}
        </section>

        <section className="deck-list">
          <div className="section-title">
            <BookOpen size={18} />
            My words
          </div>
          {cards.map((card) => (
            <button key={card.id} className={card.id === activeCard?.id ? 'selected' : ''} onClick={() => setActiveId(card.id)}>
              <span>
                <strong>{card.term}</strong>
                <small>{TYPE_LABELS[card.type]} · {DIFFICULTY[card.difficulty].label}</small>
              </span>
              <Volume2 size={16} onClick={(event) => {
                event.stopPropagation();
                speakWithCambridge(card.term, 'en-US');
              }} />
            </button>
          ))}
        </section>

        <button className="reset-button" onClick={resetDeck}>
          <RotateCcw size={18} />
          Reset sample deck
        </button>
      </aside>
        </>
      )}

      {aboutOpen && (
        <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <section className="about-card">
            <button className="about-close" type="button" onClick={() => setAboutOpen(false)} aria-label="Close About">
              <X size={17} />
            </button>
            <p className="about-kicker">About</p>
            <h2 id="about-title">Ing. Jilson Pérez</h2>
            <strong>Software Developer</strong>
            <p>Ecuador - Quito</p>
          </section>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
