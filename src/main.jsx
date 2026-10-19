import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Home,
  ChevronDown,
  Pencil,
  MoreHorizontal,
  FlipHorizontal2,
  Info,
  LogOut,
  LockKeyhole,
  Plus,
  Settings2,
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
const cambridgeAudioCache = new Map();
const cambridgeEntryCache = new Map();
let activeAudio = null;
let activeUtterance = null;
let pronunciationRequestId = 0;

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
  'raise',
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

function classifyTerm(term, context = '') {
  const lower = term.toLowerCase();
  const contextLower = context.toLowerCase();
  const words = lower.split(' ');
  const secondWord = words[1];
  const knownAdjectives = new Set(['straightforward', 'successful', 'reliable', 'simple', 'clear', 'accurate']);

  if (words.length > 1 && phrasalParticles.has(secondWord)) return 'phrasalVerb';
  if (words.length > 2) return 'expression';
  if (new RegExp(`\\b(is|are|was|were|be|very|so|too|quite|really)\\s+${escapeRegExp(lower)}\\b`).test(contextLower)) {
    return 'adjective';
  }
  if (new RegExp(`\\bto\\s+${escapeRegExp(lower)}\\b`).test(contextLower)) return 'verb';
  if (commonVerbs.has(lower) || lower.endsWith('ize') || lower.endsWith('ate') || lower.endsWith('fy')) {
    return 'verb';
  }
  if (commonNouns.has(lower) || lower.endsWith('tion') || lower.endsWith('ment') || lower.endsWith('ness')) {
    return 'noun';
  }
  if (lower.endsWith('ly')) return 'adverb';
  if (
    knownAdjectives.has(lower) ||
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
  const cleanExample = normalizeTerm(userExample);

  if (cleanExample) {
    if (type === 'adjective') {
      return [
        cleanExample,
        `The instructions are ${word}, so the team can finish the setup without help.`,
        `The route is ${word} once you leave the station and follow the blue signs.`,
        `Kity gave Max a ${word} answer instead of adding unnecessary details.`,
      ];
    }

    if (type === 'noun') {
      return [
        cleanExample,
        `The ${word} is Friday at 5 p.m., so the report needs to be ready today.`,
        `Max asked whether the ${word} could be extended by two days.`,
        `Kity missed the ${word} because the final file was still uploading.`,
      ];
    }

    if (type === 'phrasalVerb') {
      return [
        cleanExample,
        `Max needs to ${word} on the emails he missed this morning.`,
        `Kity stayed after the meeting to ${word} with the rest of the team.`,
        `The summary helped everyone ${word} after a week away.`,
      ];
    }

    return [
      cleanExample,
      `The manager asked the team to ${word} the issue before lunch.`,
      `Kity will ${word} the final version after Max reviews it.`,
      `The client wants us to ${word} the request by Friday.`,
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
      `Max said "${term}" when the plan changed at the last minute.`,
      `Kity used "${word}" after the client cancelled the call.`,
    ];
  }

  return [
    `The ${word} is Friday at 5 p.m., so the team needs the report today.`,
    `Kity asked whether the ${word} could be moved to next week.`,
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

function sentenceWithPeriod(sentence) {
  if (!sentence) return '';
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function conversationExamples(term, type, userExample = '') {
  const word = term.toLowerCase();
  const cleanExample = normalizeTerm(userExample);
  const scenario = sentenceWithPeriod(cleanExample);

  if (cleanExample) {
    if (type === 'phrasalVerb') {
      return [
        [
          { speaker: 'Max', line: `I saw this sentence in the news: "${scenario}"` },
          { speaker: 'Kity', line: `Yes, "${word}" means someone is asking or urging people to do something there.` },
          { speaker: 'Max', line: 'So it is stronger than just mentioning the group?' },
          { speaker: 'Kity', line: `Exactly. They are actively ${word.replace(/^call on$/, 'calling on')} people to respond.` },
          { speaker: 'Max', line: 'That sounds formal, like a public announcement.' },
          { speaker: 'Kity', line: `Right. You often hear "${word}" in speeches, news, or official requests.` },
          { speaker: 'Max', line: 'Now the sentence makes more sense.' },
          { speaker: 'Kity', line: 'Yes, focus on who is asking and what action they want.' },
        ],
        [
          { speaker: 'Max', line: `The mayor will ${word} residents to save water this summer.` },
          { speaker: 'Kity', line: 'That sounds natural because it is a public request.' },
          { speaker: 'Max', line: 'Could a teacher use it with students too?' },
          { speaker: 'Kity', line: `Yes. A teacher might ${word} students to help after class.` },
          { speaker: 'Max', line: 'So the phrase points to a request for action.' },
          { speaker: 'Kity', line: 'Exactly, and the context tells you what action is wanted.' },
          { speaker: 'Max', line: 'Good, I can use it in serious conversations.' },
          { speaker: 'Kity', line: 'That is the right feeling for it.' },
        ],
      ];
    }

    if (type === 'verb') {
      return [
        [
          { speaker: 'Max', line: `At the meeting, the manager said, "${scenario}"` },
          { speaker: 'Kity', line: `That means people should ${word} their hands to show agreement.` },
          { speaker: 'Max', line: 'So everyone can see who supports the idea.' },
          { speaker: 'Kity', line: `Exactly. In that context, ${word} means to lift something up.` },
          { speaker: 'Max', line: 'Could I use it for prices too?' },
          { speaker: 'Kity', line: `Yes, a company can ${word} prices, but that is a different context.` },
          { speaker: 'Max', line: 'I see. The object after the verb matters.' },
          { speaker: 'Kity', line: 'Right, it tells you what is going up.' },
        ],
        [
          { speaker: 'Max', line: `Please ${word} your hand if you have a question.` },
          { speaker: 'Kity', line: 'That sounds natural in a class or meeting.' },
          { speaker: 'Max', line: 'What if I say the company will raise salaries?' },
          { speaker: 'Kity', line: 'That works too, because salaries go up.' },
          { speaker: 'Max', line: 'So the meaning changes a little with the object.' },
          { speaker: 'Kity', line: 'Yes, but the basic idea is moving something higher.' },
          { speaker: 'Max', line: 'That helps me connect the uses.' },
          { speaker: 'Kity', line: 'Exactly. Context makes it clearer.' },
        ],
      ];
    }

    if (type === 'adjective') {
      return [
        [
          { speaker: 'Max', line: 'The new reporting tool looks complicated.' },
          { speaker: 'Kity', line: `It is actually ${word} once you choose the date range.` },
          { speaker: 'Max', line: 'So I just select the dates and press Generate?' },
          { speaker: 'Kity', line: 'Exactly. The summary appears in less than a minute.' },
          { speaker: 'Max', line: 'That is easier than I expected.' },
          { speaker: 'Kity', line: 'The setup page looks busy, but the process is simple.' },
        ],
        [
          { speaker: 'Max', line: 'Can we finish the client proposal today?' },
          { speaker: 'Kity', line: `Yes, the last section is ${word}; the legal part was the hard one.` },
          { speaker: 'Max', line: 'Great. I will review the budget table first.' },
          { speaker: 'Kity', line: 'I will check the timeline and send it before lunch.' },
          { speaker: 'Max', line: 'Should we add more technical details?' },
          { speaker: 'Kity', line: `No, keep the explanation ${word} so the client can decide quickly.` },
        ],
      ];
    }

    if (type === 'noun') {
      return [
        [
          { speaker: 'Max', line: 'When do we need to send the final report?' },
          { speaker: 'Kity', line: `The ${word} is Friday at 5 p.m.` },
          { speaker: 'Max', line: 'Then I will finish the charts tonight.' },
          { speaker: 'Kity', line: 'Great. I will review the summary tomorrow morning.' },
        ],
        [
          { speaker: 'Max', line: 'The client asked for two more days.' },
          { speaker: 'Kity', line: `We can extend the ${word}, but we need approval first.` },
          { speaker: 'Max', line: 'I will ask the manager after lunch.' },
          { speaker: 'Kity', line: 'Thanks. The design team needs a clear answer today.' },
        ],
      ];
    }

    return [
      [
        { speaker: 'Max', line: `The manager said, "${scenario}"` },
        { speaker: 'Kity', line: 'Then the whole team needs to act before the meeting.' },
        { speaker: 'Max', line: 'I will update the dashboard first.' },
        { speaker: 'Kity', line: 'Good. I will check the client notes and send the summary.' },
      ],
      [
        { speaker: 'Max', line: 'Can we finish this before lunch?' },
        { speaker: 'Kity', line: `${scenario}` },
        { speaker: 'Max', line: 'All right. I will take care of the first part.' },
        { speaker: 'Kity', line: 'Perfect. I will handle the final review.' },
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
  const type = classifyTerm(normalized, example);

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

function splitManualExamples(value) {
  return value
    .split(/\n+/)
    .map((line) => normalizeTerm(line.replace(/^\s*[-*\d.)]+\s*/, '')))
    .filter(Boolean)
    .slice(0, 4);
}

function parseManualConversations(value) {
  return value
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split(/\n+/)
        .map((line, index) => {
          const match = line.match(/^\s*([^:]{1,24}):\s*(.+)$/);
          if (match) {
            return { speaker: normalizeTerm(match[1]), line: normalizeTerm(match[2]) };
          }
          return { speaker: index % 2 === 0 ? 'A' : 'B', line: normalizeTerm(line) };
        })
        .filter((line) => line.line),
    )
    .filter((conversation) => conversation.length)
    .slice(0, 3);
}

function displaySpeaker(index) {
  return index % 2 === 0 ? 'Ethan' : 'Emma';
}

function normalizeAiType(value, fallback) {
  const compact = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, '');

  const aliases = {
    verb: 'verb',
    noun: 'noun',
    adjective: 'adjective',
    adverb: 'adverb',
    expression: 'expression',
    phrase: 'expression',
    idiom: 'expression',
    phrasalverb: 'phrasalVerb',
  };

  return aliases[compact] || fallback;
}

function generatedText(data) {
  const examples = Array.isArray(data.examples) ? data.examples : [];
  const conversations = Array.isArray(data.conversations) ? data.conversations : [];
  const lines = conversations.flatMap((conversation) =>
    Array.isArray(conversation) ? conversation.map((line) => line?.line || '') : [],
  );

  return [data.meaning || '', ...examples, ...lines].join(' ');
}

function validateAiCardData(data) {
  if (!data.meaning || !data.examples.length || !data.conversations.length) {
    throw new Error('AI generated incomplete card content');
  }

  const text = generatedText(data);
  const disallowed = [
    /—/,
    /[¿¡ñáéíóúü]/i,
    /\b(el|la|los|las|un|una|unos|unas|para|porque|cuando|donde|como|significa|traduccion|espanol)\b/i,
    /\b(word|vocabulary|flashcard|card|prompt|AI|JSON|learn|study|memorize|memorise|practice|practise)\b/i,
  ];

  if (disallowed.some((pattern) => pattern.test(text))) {
    throw new Error('AI generated translated or meta content');
  }
}

async function generateAiCardData(term, userExample, type) {
  const data = await apiRequest('/api/generate-card', {
    method: 'POST',
    body: JSON.stringify({
      term,
      userExample,
      type,
    }),
  });

  if (!data.meaning || !Array.isArray(data.examples) || !Array.isArray(data.conversations)) {
    throw new Error('AI generation returned an invalid card shape');
  }

  const aiType = normalizeAiType(data.type, type);
  const normalized = {
    type: aiType,
    meaning: String(data.meaning).trim(),
    examples: data.examples.slice(0, 4).map((example) => String(example).trim()).filter(Boolean),
    conversations: data.conversations.slice(0, 3).map((conversation) =>
      conversation.slice(0, 6).map((line, index) => ({
        speaker: line.speaker === 'Kity' || index % 2 === 1 ? 'Kity' : 'Max',
        line: String(line.line || '').trim(),
      })),
    ),
  };

  validateAiCardData(normalized);

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
  if (!Array.isArray(payload.cards)) throw new Error('Invalid deck response');
  return payload.cards;
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
    part.toLowerCase() === term.toLowerCase() ? (
      <strong className="term-highlight" key={`${part}-${index}`}>
        {part}
      </strong>
    ) : (
      part
    ),
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

function playAudioUrl(url, waitForEnd = false) {
  return new Promise((resolve, reject) => {
    if (activeAudio) activeAudio.pause();
    const audio = new Audio(url);
    activeAudio = audio;
    let settled = false;
    const timeout = window.setTimeout(() => fail(new Error('Audio did not start')), 15000);
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve();
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (activeAudio === audio) activeAudio = null;
      audio.pause();
      reject(error);
    };
    audio.preload = 'auto';
    audio.addEventListener('playing', () => {
      window.clearTimeout(timeout);
      if (!waitForEnd) finish();
    }, { once: true });
    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = null;
      finish();
    }, { once: true });
    audio.addEventListener('error', () => fail(new Error('Audio is unavailable')), { once: true });
    audio.addEventListener('pause', () => {
      if (!audio.ended) fail(new Error('Audio interrupted'));
    }, { once: true });
    audio.play().catch(fail);
  });
}

function pronunciationChunks(text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > 180) {
    const boundary = remaining.lastIndexOf(' ', 180);
    const end = boundary > 0 ? boundary : 180;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function speak(text, locale = 'en-US') {
  const synth = window.speechSynthesis;
  if (!synth || !window.SpeechSynthesisUtterance) throw new Error('Browser speech is unavailable');
  const voices = synth.getVoices();
  const normalizedLocale = locale.toLowerCase();
  const preferredVoice =
    voices.find((voice) => voice.lang.replace('_', '-').toLowerCase() === normalizedLocale) ||
    voices.find((voice) => /^en[-_]/i.test(voice.lang));
  if (!preferredVoice) throw new Error('No English browser voice is available');

  return new Promise((resolve, reject) => {
    const utterance = new window.SpeechSynthesisUtterance(text);
    // Keep a reference until speech finishes; some browser engines release it early otherwise.
    activeUtterance = utterance;
    const startTimeout = window.setTimeout(() => {
      synth.cancel();
      finish(new Error('Browser speech did not start'));
    }, 2500);
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(startTimeout);
      if (activeUtterance === utterance) activeUtterance = null;
      if (error) reject(error); else resolve();
    };
    utterance.lang = locale;
    utterance.voice = preferredVoice;
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onstart = () => window.clearTimeout(startTimeout);
    utterance.onend = () => finish();
    utterance.onerror = () => finish(new Error('Browser speech failed'));
    try {
      synth.speak(utterance);
      if (synth.paused) synth.resume();
    } catch (error) {
      finish(error);
    }
  });
}

async function speakWithCambridge(text, locale = 'en-US') {
  const term = text.trim().replace(/\s+/g, ' ');
  const requestId = ++pronunciationRequestId;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  window.speechSynthesis?.cancel();
  activeUtterance = null;
  if (!term) return;

  if (!/\s/.test(term)) {
    const candidates = await fetchCambridgeCandidates(term, locale);
    for (const url of candidates) {
      if (requestId !== pronunciationRequestId) return;
      try {
        await playAudioUrl(url);
        return;
      } catch {
        // Try another recording, then read the complete word instead.
      }
    }
  }
  if (requestId !== pronunciationRequestId) return;

  try {
    await speak(term, locale);
    return;
  } catch {
    if (requestId !== pronunciationRequestId) return;
  }

  // Embedded browsers may have no Web Speech API. Fetch playable English audio
  // for the entire expression, without ever substituting a dictionary headword.
  try {
    for (const chunk of pronunciationChunks(term)) {
      if (requestId !== pronunciationRequestId) return;
      const query = new URLSearchParams({ text: chunk, locale });
      await playAudioUrl(`/api/pronunciation?${query}`, true);
    }
  } catch (error) {
    if (requestId === pronunciationRequestId) throw error;
  }
}

function App() {
  const rememberedAuth = loadRememberedAuth();
  const [auth, setAuth] = useState(activeSession);
  const [authMode, setAuthMode] = useState('login');
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [authForm, setAuthForm] = useState({
    name: '',
    lastName: '',
    email: rememberedAuth.email || '',
    password: rememberedAuth.password || '',
    remember: rememberedAuth.remember !== false,
  });
  const [cards, setCards] = useState([]);
  const persistedDeck = useRef({ email: null, cards: null, remoteLoaded: false });
  const [term, setTerm] = useState('');
  const [example, setExample] = useState('');
  const [manualMeaning, setManualMeaning] = useState('');
  const [manualConversations, setManualConversations] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [pronunciationError, setPronunciationError] = useState('');
  const [deckReady, setDeckReady] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [isChanging, setIsChanging] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState('home');
  const [isFlipped, setIsFlipped] = useState(false);
  const [entryInfo, setEntryInfo] = useState(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedAdminId, setSelectedAdminId] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setAboutOpen(false);
        setAccountOpen(false);
        setEditorOpen(false);
      }
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  useEffect(() => {
    if (!editorOpen && !accountOpen && !aboutOpen) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('.editor-dialog, [aria-labelledby="account-title"], [aria-labelledby="about-title"]');
    const focusable = () => [...dialog.querySelectorAll('button, input, textarea, [tabindex="0"]')].filter((element) => !element.disabled);
    const elements = focusable();
    if (editorOpen) dialog.querySelector('input')?.focus();
    else elements[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function trapTab(event) {
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    window.addEventListener('keydown', trapTab);
    return () => {
      window.removeEventListener('keydown', trapTab);
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, [editorOpen, accountOpen, aboutOpen]);

  function openEditor(card = null) {
    setEditingId(card?.id || null);
    setTerm(card?.term || '');
    setManualMeaning(card?.meaning || '');
    setExample(card?.examples?.join('\n') || '');
    setManualConversations(card?.conversations?.map((conversation) =>
      conversation.map((line) => `${line.speaker}: ${line.line}`).join('\n')
    ).join('\n\n') || '');
    setGenerationError('');
    setEditorOpen(true);
  }

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
    // Loading or switching accounts must never write a deck back to storage.
    if (!deckReady || !auth?.email || persistedDeck.current.email !== auth.email) return;
    if (persistedDeck.current.cards === cards) return;
    saveCards(cards, auth.email);
    const remoteLoaded = persistedDeck.current.remoteLoaded;
    persistedDeck.current = { email: auth.email, cards, remoteLoaded };
    if (remoteLoaded) saveCardsToApi(cards, auth.email).catch(() => {});
  }, [cards, auth?.email, deckReady]);

  useEffect(() => {
    let isCurrent = true;
    setDeckReady(false);
    const localCards = loadCards(auth?.email);
    persistedDeck.current = { email: auth?.email, cards: localCards, remoteLoaded: false };
    setCards(localCards);
    setActiveId(null);
    setSelectedType('all');
    setViewMode('home');

    if (auth?.email) {
      loadCardsFromApi(auth.email)
        .then((remoteCards) => {
          if (isCurrent) {
            persistedDeck.current = { email: auth.email, cards: remoteCards, remoteLoaded: true };
            setCards(remoteCards);
          }
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
    setPronunciationError('');
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
    setAuthSuccess('');

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
      setAuthForm((current) => ({ ...current, email, password: '', name: '', lastName: '' }));
      setAuthMode('login');
      setAuthSuccess('Your account is ready. Log in to continue.');
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
    setMenuOpen(false);
    setEditorOpen(false);
    setAccountOpen(false);
    setSelectedAdminId(null);
  }

  async function addCard(event) {
    event.preventDefault();
    const normalized = normalizeTerm(term);
    const manualExamples = splitManualExamples(example);
    const normalizedMeaning = normalizeTerm(manualMeaning);
    const parsedConversations = parseManualConversations(manualConversations);
    const normalizedExample = manualExamples[0] || '';
    if (!normalized || !normalizedMeaning || !manualExamples.length) {
      setGenerationError('Add a word, a meaning, and at least one example to save your card.');
      return;
    }
    const exists = cards.some((card) => card.id !== editingId && card.term.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setGenerationError('This word already exists. Select its card in Admin to edit it.');
      return;
    }
    const existing = cards.find((card) => card.id === editingId);
    const nextCard = {
      ...(existing || buildCard(normalized, normalizedExample)),
      term: normalized,
      type: classifyTerm(normalized, normalizedExample),
      userExample: normalizedExample,
      meaning: normalizedMeaning,
      examples: manualExamples,
      conversations: parsedConversations,
      aiGenerated: false,
      updatedAt: Date.now(),
    };
    setCards((current) => editingId
      ? current.map((card) => card.id === editingId ? nextCard : card)
      : [nextCard, ...current]);
    setSelectedAdminId(nextCard.id);
    setSelectedType('all');
    setEditorOpen(false);
    setGenerationError('');
    setNotice(editingId ? 'Card updated.' : 'Card created.');
  }

  function showNext() {
    if (isChanging) return;
    setIsChanging(true);
    window.setTimeout(() => {
      const candidates = filteredCards.filter((card) => card.id !== activeCard?.id);
      const next = weightedPick(candidates.length ? candidates : filteredCards);
      setIsFlipped(false);
      setActiveId(next?.id || null);
      setIsChanging(false);
    }, 220);
  }

  function markDifficulty(difficulty) {
    if (!activeCard || isChanging) return;

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
    setSelectedAdminId(null);
    setNotice('Card deleted.');
  }

  async function pronounceCard(card, locale) {
    setPronunciationError('');
    try {
      await speakWithCambridge(card.term, locale);
    } catch {
      setPronunciationError('Audio could not be played. Check your connection and try the speaker again.');
    }
  }

  function renderPronunciationButtons(card) {
    return (
      <div className="pronunciation-buttons" aria-label="Pronunciation options">
        <button className="icon-button language-button" onClick={() => pronounceCard(card, 'en-US')} title="US pronunciation">
          <Volume2 size={19} />
          <span>US</span>
        </button>
        <button className="icon-button language-button" onClick={() => pronounceCard(card, 'en-GB')} title="UK pronunciation">
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
      <section className={`flashcard tone-${activeCard?.type || 'noun'} ${isChanging ? 'leaving' : 'entering'}`} aria-live="polite">
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

                    {conversations.length > 0 && <div className="dialogues">
                      <h2>Conversation</h2>
                      {conversations.map((conversation, index) => (
                        <div className="dialogue" key={`dialogue-${index}`}>
                          {conversation.map((line, lineIndex) => (
                            <p key={`${line.speaker}-${line.line}`}>
                              <strong className={`speaker-label speaker-${lineIndex % 2 === 0 ? 'a' : 'b'}`}>
                                {displaySpeaker(lineIndex)}:
                              </strong>{' '}
                              {highlightTerm(line.line, activeCard.term)}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>}
                  </div>
                </div>
              )}
            </div>

            <button className="flip-button" onClick={() => setIsFlipped(!isFlipped)}>
              <FlipHorizontal2 size={18} />
              {isFlipped ? 'Back to word' : 'See meaning'}
            </button>
            {pronunciationError && <p className="auth-error generation-error" role="alert">{pronunciationError}</p>}
            {generationError && <p className="auth-error generation-error" role="alert">{generationError}</p>}

            <div className="actions" aria-label="Difficulty choices">
              <button className="easy" disabled={isChanging} onClick={() => markDifficulty('easy')}>
                <CheckCircle2 size={19} />
                Got it
              </button>
              <button className="medium" disabled={isChanging} onClick={() => markDifficulty('medium')}>
                <Brain size={19} />
                Almost
              </button>
              <button className="hard" disabled={isChanging} onClick={() => markDifficulty('hard')}>
                <Sparkles size={19} />
                Again
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
          <button className="home-card primary" onClick={() => { setSelectedType('all'); setViewMode('study'); setIsFlipped(false); }}>
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
          <header className="auth-copy">
            <span className="auth-brand" aria-label="Jilson">J</span>
            <h1>English Flashcards</h1>
          </header>

          <form className="auth-form" onSubmit={submitAuth}>
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
                <UserRound size={18} aria-hidden="true" />
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
              <div className="auth-input">
                <LockKeyhole size={18} aria-hidden="true" />
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => updateAuthForm('password', event.target.value)}
                  autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
            </label>

            <label className="remember-row">
              <input
                type="checkbox"
                checked={authForm.remember}
                onChange={(event) => updateAuthForm('remember', event.target.checked)}
              />
              Remember my password on this device
            </label>

            {authError && <p className="auth-error" role="alert">{authError}</p>}
            {authSuccess && <p className="auth-success" role="status">{authSuccess}</p>}

            <button className="auth-submit" type="submit">
              {authMode === 'register' ? 'Create account' : 'Log in'}
            </button>
          </form>
          <p className="auth-switch">
            {authMode === 'register' ? 'Already have an account? ' : "Don’t have an account? "}
            <button type="button" onClick={() => {
              setAuthMode(authMode === 'register' ? 'login' : 'register');
              setAuthError('');
              setAuthSuccess('');
            }}>{authMode === 'register' ? 'Log in' : 'Register'}</button>
          </p>
        </section>
      </main>
    );
  }

  if (!auth) return renderAuth();
  if (!deckReady) return <main className="auth-shell"><p role="status">Loading your vocabulary…</p></main>;

  return (
    <main className={`app-shell ${viewMode === 'study' ? 'study-only' : ''} ${viewMode === 'home' ? 'home-mode' : 'admin-mode'}`}>
      <a className="brand-mark" href="#" aria-label="English Flashcards home" onClick={(event) => { event.preventDefault(); setViewMode('home'); }}>J</a>
      <nav className="mode-switch" aria-label="App mode">
        <button aria-label="Home" title="Home" className={viewMode === 'home' ? 'active' : ''} onClick={() => setViewMode('home')}><Home size={19} /></button>
        <button className={viewMode === 'study' ? 'active' : ''} onClick={() => { setSelectedType('all'); setViewMode('study'); setIsFlipped(false); }}><BookOpen size={17} />Study</button>
        <button className={viewMode === 'admin' ? 'active' : ''} onClick={() => setViewMode('admin')}><Settings2 size={17} />Admin</button>
      </nav>
      {menuOpen && <button className="menu-dismiss" aria-label="Close menu" onClick={() => setMenuOpen(false)} />}
      <div className="account-menu">
        <button className="account-trigger" aria-label="Account menu" aria-expanded={menuOpen} aria-controls="account-dropdown" onClick={() => setMenuOpen(!menuOpen)}><UserRound size={19} /><ChevronDown size={14} /></button>
        {menuOpen && <div className="account-dropdown" id="account-dropdown">
          <p>{auth.name || 'Your account'}</p>
          <button onClick={() => { setAccountOpen(true); setMenuOpen(false); }}><UserRound size={17} />My account</button>
          <button onClick={() => { setAboutOpen(true); setMenuOpen(false); }}><Info size={17} />About</button>
          <button onClick={logout}><LogOut size={17} />Log out</button>
        </div>}
      </div>
      {viewMode === 'home' ? renderHome() : viewMode === 'study' ? (
        <section className="focus-stage">
          <div className="study-heading"><div><p className="eyebrow">A little practice, every day</p><h1>Your next word</h1></div><span>{cards.length} cards · Random review</span></div>
          {renderFlashcard()}
        </section>
      ) : (
        <section className="admin-collection">
          <header className="collection-header">
            <div><p className="eyebrow">Make every word yours</p><h1>Your vocabulary</h1><p>{cards.length} cards in your collection</p></div>
            <button className="new-card-button" onClick={() => openEditor()}><Plus size={20} />New card</button>
          </header>
          <div className="collection-stats"><span><i className="dot hard" />{stats.hard} Again</span><span><i className="dot medium" />{stats.medium} Almost</span><span><i className="dot easy" />{stats.easy} Got it</span></div>
          <div className="filters" aria-label="Card filters">
            <button className={selectedType === 'all' ? 'active' : ''} onClick={() => setSelectedType('all')}>All <small>{cards.length}</small></button>
            {Object.entries(TYPE_LABELS).map(([type, label]) => <button key={type} className={selectedType === type ? 'active' : ''} onClick={() => setSelectedType(type)}>{label} <small>{groupedCards[type]?.length || 0}</small></button>)}
          </div>
          <p className="collection-notice" role="status">{notice || 'Select a card to edit or delete it.'}</p>
          <div className="vocabulary-grid">
            {filteredCards.map((card) => (
              <article key={card.id} className={`vocabulary-card tone-${card.type} ${selectedAdminId === card.id ? 'selected' : ''}`}>
                <button className="card-select" aria-expanded={selectedAdminId === card.id} onClick={() => setSelectedAdminId(selectedAdminId === card.id ? null : card.id)}>
                  <span className="tile-top"><span>{TYPE_LABELS[card.type]}</span><MoreHorizontal size={20} /></span>
                  <strong>{card.term}</strong><span className="tile-meaning">{card.meaning}</span>
                  <span className="tile-bottom">{DIFFICULTY[card.difficulty].label}<span>{card.reviews} reviews</span></span>
                </button>
                {selectedAdminId === card.id && <div className="tile-actions"><button onClick={() => openEditor(card)}><Pencil size={16} />Edit</button><button onClick={() => removeCard(card.id)}><Trash2 size={16} />Delete</button></div>}
              </article>
            ))}
          </div>
          {!filteredCards.length && <div className="collection-empty"><BookOpen size={32} /><h2>No cards here yet</h2><p>Use New card to add a word to your collection.</p></div>}
        </section>
      )}
      {editorOpen && <div className="about-overlay editor-overlay" onClick={(event) => { if (event.target === event.currentTarget) setEditorOpen(false); }}>
        <section className="editor-dialog" role="dialog" aria-modal="true" aria-labelledby="editor-title">
          <header><div><p className="eyebrow">Your vocabulary</p><h2 id="editor-title">{editingId ? 'Edit card' : 'New card'}</h2></div><button className="icon-button" aria-label="Close editor" onClick={() => setEditorOpen(false)}><X size={20} /></button></header>
        <form className="add-form" onSubmit={addCard}>
          <div className="add-fields">
            <div className="word-column">
              <label htmlFor="new-term">
                Word or expression
                <input
                  id="new-term"
                  value={term}
                  onChange={(event) => setTerm(event.target.value)}
                  placeholder="try: straightforward, catch up, deadline..."
                  autoComplete="off"
                  autoFocus
                  required
                />
              </label>
              <p className="detected-type">
                Detected: <strong>{TYPE_LABELS[classifyTerm(term || 'word', splitManualExamples(example)[0] || '')] || 'Vocabulary'}</strong>
              </p>
            </div>
            <label htmlFor="new-meaning">
              Meaning
              <textarea
                id="new-meaning"
                required
                value={manualMeaning}
                onChange={(event) => setManualMeaning(event.target.value)}
                placeholder="Simple and clear definition in English..."
                rows={3}
              />
            </label>
          </div>
          <label htmlFor="new-example">
            Examples
            <textarea
              id="new-example"
              required
              value={example}
              onChange={(event) => setExample(event.target.value)}
              placeholder={`Write 1, 2, or 3 examples. One example per line.\nThe problem is straightforward to solve once you see the pattern.`}
              rows={5}
            />
          </label>
          <label htmlFor="new-conversations">
            Conversations (optional)
            <textarea
              id="new-conversations"
              value={manualConversations}
              onChange={(event) => setManualConversations(event.target.value)}
              placeholder={`Ethan: The new process looks confusing.\nEmma: It is straightforward once you choose the right account.\nEthan: So I only need to follow these three steps?\nEmma: Exactly.\n\nEthan: Can we explain this to the client today?\nEmma: Yes, keep the answer straightforward and focus on the result.`}
              rows={9}
            />
          </label>
          <p className="form-hint">Add at least one example. For conversations, separate each dialogue with a blank line.</p>
          <div className="input-row add-submit-row">
            <button type="button" className="secondary-button" onClick={() => setEditorOpen(false)}>Cancel</button>
            <button
              type="submit"

            >
              <Plus size={19} />
              {editingId ? 'Save changes' : 'Build card'}
            </button>
          </div>
          {generationError && <p className="auth-error generation-error" role="alert">{generationError}</p>}
        </form>

        </section>
      </div>}
      {accountOpen && <div className="about-overlay"><section className="about-card" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="about-close" aria-label="Close account" onClick={() => setAccountOpen(false)}><X size={17} /></button><p className="about-kicker">My account</p><h2 id="account-title">{auth.name} {auth.lastName}</h2><p>{auth.email}</p><p>{cards.length} vocabulary cards</p></section></div>}

      {aboutOpen && (
        <div className="about-overlay" role="dialog" aria-modal="true" aria-labelledby="about-title">
          <section className="about-card" aria-labelledby="about-title">
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
