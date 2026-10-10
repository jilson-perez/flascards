import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Database,
  FlipHorizontal2,
  Layers3,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import './styles.css';

const STORAGE_KEY = 'english-flashcards-v1';
const CAMBRIDGE_BASE_URL = 'https://dictionary.cambridge.org';
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
  const context = cleanExample ? ` In your example, it appears in this context: "${cleanExample}"` : '';

  if (type === 'phrasalVerb') return `To ${lower} means to discover, understand, solve, or complete something depending on the context.${context}`;
  if (type === 'verb') return `To ${lower} means to perform this action in a real situation.${context}`;
  if (type === 'adjective') return `${titleCase(term)} describes the quality, condition, or feeling of a person, thing, or situation.${context}`;
  if (type === 'adverb') return `${titleCase(term)} explains how an action happens.${context}`;
  if (type === 'expression') return `${titleCase(term)} is an expression used as a complete idea in conversation.${context}`;
  return `${titleCase(term)} is a noun used to name a person, thing, idea, event, or situation.${context}`;
}

function conversationExamples(term, type, userExample = '') {
  const word = term.toLowerCase();
  const cleanExample = normalizeTerm(userExample);

  if (cleanExample) {
    return [
      [
        { speaker: 'Max', line: `I found this example: "${cleanExample}"` },
        { speaker: 'Kity', line: `Nice. The key word is "${word}", so listen to how it works in that sentence.` },
        { speaker: 'Max', line: `So I should practice "${word}" inside a full idea, not alone.` },
        { speaker: 'Kity', line: 'Exactly. Context makes the word easier to remember and use.' },
      ],
      [
        { speaker: 'Max', line: `Can I use "${word}" in a real conversation today?` },
        { speaker: 'Kity', line: `Yes. Start from your example and change one detail at a time.` },
        { speaker: 'Max', line: `Then "${word}" becomes flexible, not just memorized.` },
        { speaker: 'Kity', line: 'That is the goal: understand it, hear it, and use it naturally.' },
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
      ],
      [
        { speaker: 'Max', line: `Did you ${word} how to use the new app?` },
        { speaker: 'Kity', line: 'Yes, but it took me a few minutes to understand the settings.' },
        { speaker: 'Max', line: `I am still trying to ${word} the pronunciation tool.` },
        { speaker: 'Kity', line: 'Click the audio button first, then repeat the sentence out loud.' },
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
      ],
      [
        { speaker: 'Max', line: `Can you show me how to ${word} this naturally in a sentence?` },
        { speaker: 'Kity', line: 'Sure. Think about a normal situation from your day.' },
        { speaker: 'Max', line: `Okay, I will ${word} it with an example from work.` },
        { speaker: 'Kity', line: 'Perfect. Real context makes it easier to remember.' },
      ],
    ];
  }

  return [
    [
      { speaker: 'Max', line: `I heard "${word}" in a meeting today, but I was not sure how to use it.` },
      { speaker: 'Kity', line: 'Try connecting it to a situation you already understand.' },
      { speaker: 'Max', line: `So I can say "${word}" when I talk about this kind of situation?` },
      { speaker: 'Kity', line: 'Yes. Say the full sentence a few times so it feels natural.' },
    ],
    [
      { speaker: 'Max', line: `I want "${word}" to become part of my active vocabulary.` },
      { speaker: 'Kity', line: 'Then use it in a short message or conversation today.' },
      { speaker: 'Max', line: `I will write two sentences with "${word}" after this card.` },
      { speaker: 'Kity', line: 'Nice. That is how passive words become usable words.' },
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

function loadCards() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) && saved.length ? saved : starterCards;
  } catch {
    return starterCards;
  }
}

function saveCards(cards) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
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
    audio.preload = 'auto';

    const rejectIfCurrent = () => {
      if (activeAudio === audio) activeAudio = null;
      reject(new Error('Audio failed'));
    };

    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = null;
    });
    audio.addEventListener('error', rejectIfCurrent, { once: true });
    audio
      .play()
      .then(resolve)
      .catch(rejectIfCurrent);
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
  const [cards, setCards] = useState(loadCards);
  const [term, setTerm] = useState('');
  const [example, setExample] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [isChanging, setIsChanging] = useState(false);
  const [selectedType, setSelectedType] = useState('all');
  const [viewMode, setViewMode] = useState('home');
  const [isFlipped, setIsFlipped] = useState(false);
  const [entryInfo, setEntryInfo] = useState(null);

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
    saveCards(cards);
  }, [cards]);

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

  function addCard(event) {
    event.preventDefault();
    const normalized = normalizeTerm(term);
    const normalizedExample = normalizeTerm(example);
    if (!normalized || !normalizedExample) return;

    const exists = cards.some((card) => card.term.toLowerCase() === normalized.toLowerCase());
    if (exists) {
      setTerm('');
      setExample('');
      return;
    }

    const nextCard = buildCard(normalized, normalizedExample);
    setCards((current) => [nextCard, ...current]);
    setActiveId(nextCard.id);
    setTerm('');
    setExample('');
    window.setTimeout(() => speakWithCambridge(nextCard.term, 'en-US'), 150);
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
    setCards(starterCards.map((card) => ({ ...card, id: crypto.randomUUID(), nextReviewAt: Date.now() })));
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
    const usIpa = entryInfo?.ipa?.us;
    const ukIpa = entryInfo?.ipa?.uk;

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
                    <div className="ipa-row">
                      <span>US {usIpa || '...'}</span>
                      <span>UK {ukIpa || '...'}</span>
                    </div>
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
      </nav>

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
            <button type="submit">
              <Plus size={19} />
              Build card
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
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
