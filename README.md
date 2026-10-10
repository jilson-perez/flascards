# English Flashcards

React app for studying English verbs, nouns, phrasal verbs, expressions, and vocabulary.

## Run

```bash
npm install --cache /private/tmp/flashcards-npm-cache
npm run dev
```

Open http://127.0.0.1:5173/.

## Production

```bash
npm install
npm run build
npm start
```

Open the deployed app on the port provided by your host. In production, NestJS serves both:

- React app from `dist/`
- API under `/api/*`

For Docker:

```bash
docker build -t flashcards .
docker run -p 8787:8787 --env-file .env flashcards
```

## NestJS + Redis sync

The app includes a small NestJS API so Redis credentials stay out of the browser.

1. Create a Redis database in Upstash.
2. Copy `.env.example` to `.env`.
3. Fill in:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

4. Run `npm run dev`.

Without those env vars, the API uses `server-data/fallback-db.json` for local development. The React app also keeps a local fallback copy so the UI still works if the API is unavailable.

For deployment, configure these environment variables in your host:

```bash
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
PORT=8787
```

## What it does

- Adds new English words or expressions.
- Classifies entries automatically as verb, noun, adjective, adverb, expression, or phrasal verb using frontend heuristics.
- Groups cards by type.
- Plays American English pronunciation with the browser Speech Synthesis API.
- Shows two example sentences per card.
- Lets you mark cards as Got it, Almost, or Again.
- Shows cards randomly with weighted repetition: Again appears more often, Almost appears normally, Got it appears less often.
- Syncs the deck through the NestJS API and Redis when configured.
- Falls back to local development storage when Redis credentials are missing.
