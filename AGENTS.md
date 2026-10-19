# Data preservation

- Never delete, reset, truncate, flush, reseed, or replace existing customer databases or decks as part of a code change, build, test, or deployment.
- Preserve existing Redis keys, account records, storage formats, environment settings, and customer data. Do not initialize existing decks with empty arrays.
- Verify production using read-only health and static asset requests. Do not register test accounts, log in as customers, or mutate production data for tests.
- Run write-flow tests against isolated in-memory mocks or disposable test fixtures, never against a customer database.
- Loading a session or a deck must not automatically write cached or empty data back to the database.
