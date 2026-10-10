# English Flashcards

React app for studying English verbs, nouns, phrasal verbs, expressions, and vocabulary.

## Run

```bash
npm install --cache /private/tmp/flashcards-npm-cache
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173/.

## What it does

- Adds new English words or expressions.
- Classifies entries automatically as verb, noun, adjective, adverb, expression, or phrasal verb using frontend heuristics.
- Groups cards by type.
- Plays American English pronunciation with the browser Speech Synthesis API.
- Shows two example sentences per card.
- Lets you mark cards as Easy, Medium, or Hard.
- Shows cards randomly with weighted repetition: Hard appears more often, Medium appears normally, Easy appears less often.
- Persists the deck locally with `localStorage`.

## Storage note

This is frontend-only, as requested. A real Redis database needs a backend or serverless API because React in the browser should not connect directly to Redis credentials. The storage layer is intentionally isolated so it can later be replaced by an API that writes to Redis.
