# TBR Check

Browse the list of `.ca` domains that CIRA is about to release ("To Be Released"). Each name is scored by how likely names like it are to sell at auction. You can watch domains, note a max bid, save views, and get alerts when new domains match them.

It has three parts:

| Part | Where | What it does |
| --- | --- | --- |
| **Update agent** | `bin/update.php` | Run by cron. Pulls the current TBR list and auction results, scores new domains, and raises alerts. |
| **API** | `api/public/index.php` | Slim 4 REST API. Filters, sorts and pages in the database. |
| **Client** | `src/` | React 19 + Fomantic UI, built with Vite. Loads rows in chunks as you scroll. |

```
api/
  migrations/          Schema changes, run in order as a MySQL admin
  public/index.php     API entry point
bin/
  update.php           Update agent (cron)
  backfill.php         Sync the dictionary and recompute every domain's derived data
  build-dictionary.py  Regenerate var/words.tsv
  calibrate.php        Print auction rates behind the score
etc/config.php         Local config, not tracked
lib/domains.php        Shared PHP: word matching, scoring, filters, alerts
src/                   React client
var/
  words.tsv            Generated dictionary: word, kind, frequency
  dictionary/          Curated inputs for words.tsv
```

## Requirements

- PHP 8.1+ with `pdo_mysql` and `mbstring` (tested on 8.4). Set `date.timezone`: all stored times are local.
- MySQL 8.0+.
- Node 20+ (tested on 22) for the client.
- Python 3.9+ with `wordfreq`, only to rebuild the dictionary.

## Configuration

### `etc/config.php` (not tracked)

Returns an object that the API, update agent and scripts all read:

```php
<?php
return (object)[
  'time' => time(),
  'db' => (object)[ 'host' => '…', 'name' => '…', 'user' => '…', 'pass' => '…' ],
  'tbrCmd' => '…',      // prints the current TBR list as JSON: [{ "name", "date" }, …]
  'resultsCmd' => '…',  // prints the latest auction results as JSON: { releaseDate, numberOfDomainNames, domains: [{ domainName }, …] }
  'slim' => (object)[ 'config' => [ 'settings' => [ 'displayErrorDetails' => false ] ] ],
  // Optional:
  'apiToken' => '…',      // if set, writes need this in an X-Api-Token header; the client asks for it once
  'alertWebhook' => '…',  // each alert is POSTed here as plain text, e.g. https://ntfy.sh/<topic>
];
```

The app's database user only needs `SELECT, INSERT, UPDATE, DELETE`. Migrations need `ALTER` and `CREATE`.

### `.env.local` (not tracked)

Build-time settings for the client. Vite inlines these into the public bundle, so never put secrets here. The Create React App names are still accepted.

```
PUBLIC_URL=/tbr
REACT_APP_BACKEND_API=/tbr/api/v1
```

## Setup

```sh
composer install -d api
npm install --legacy-peer-deps   # semantic-ui-react hasn't declared React 19 support yet

for f in api/migrations/*.sql; do mysql -u root -p <db> < "$f"; done   # as an admin user
php bin/backfill.php
```

## Words and scores

### Dictionary

`var/words.tsv` has about 42,000 words. Each has a **kind** (`common`, `fr`, `place`, `tech` or `name`) and a **Zipf frequency** (log₁₀ uses per billion words: about 7 for "the", 3 for rare words).

`bin/build-dictionary.py` generates it from:

- **[wordfreq](https://github.com/rspeer/wordfreq)** English and French lists (data CC BY-SA 4.0). These include plurals and other word forms; French is folded to ASCII (`marché` → `marche`). Shorter words need a higher frequency to qualify, since short fragments turn up inside unrelated names.
- `var/dictionary/places-ca.txt`: provinces, cities, regions, airport codes (`yvr`, `yyz`) and Canadiana.
- `var/dictionary/tech.txt`: terms missing from general lists (`saas`, `fintech`, `crypto`, `ai`).
- `var/dictionary/extra.txt`: short brandable words below the frequency bar (`eco`, `zen`, `bon`).
- `var/dictionary/en_CA.dic`: the original Hunspell list, now used only for proper nouns, tagged `name`.
- `var/dictionary/blocklist.txt`: fragments never to treat as words (`ana`, `ell`, `ing`).

Two-letter words (`ai`, `ev`, `bc`) only count at the start or end of a name.

To change the dictionary, edit the inputs, then rebuild and backfill:

```sh
pip install wordfreq
python3 bin/build-dictionary.py
php bin/backfill.php     # syncs the words table and rescores everything (~3 minutes)
```

### Segmentation and score

Each name is split into dictionary words, preferring the split that covers the most letters, then the one with the fewest words, then the one with the most common words. Leftover letters are kept as filler. The split is stored as `segments`, e.g. `app|nest` or `~gt|muffler`, where `~` marks filler. A name that splits entirely into words is `segmented`.

The **score** (0–100) estimates how likely a name with this shape is to sell at auction once released, on a log scale: 100 ≈ certain, 80 ≈ 40%, 50 ≈ 10%, 30 ≈ 4%, 0 ≤ 1%. It's calibrated on CIRA auction history (about 6,800 sales out of 196,000 releases as of October 2026):

| Shape | Sold at auction |
| --- | --- |
| One whole word | ~65% (≤4 letters), ~49% (5), ~38% (6+) |
| Two words | 2–7%; higher when both words are common, ×2.5 if ≤5 letters |
| Three or more words | ~1% |
| Not all words | 3 letters ~42%, 4 ~7%, 5 ~4% … 9 ~1.5% |

Word kind (tech, place, French) made no measurable difference. To re-check the table as more auctions come in, run `php bin/calibrate.php`, then update `tbr_auction_odds()` in `lib/domains.php` and backfill.

## Data model

| Table | Holds |
| --- | --- |
| `domains` | One row per domain per TBR session (`UNIQUE (domain, date_tbr)`), plus the derived columns below and the watchlist fields `flag`, `note` and `max_bid` |
| `words` | The dictionary: `word`, `kind`, `zipf` |
| `domain_words` | Which words each listed domain contains and where (`position`). Backs the "contains word" filter and the word tags. |
| `results`, `results_to_domains` | Auctions, and which domains sold in each |
| `saved_searches` | Named views (`query` is the listing's query string), optionally with `alert` on |
| `alerts` | Messages from the update agent: `status` (a watched domain was released or sold) or `match` (new domains match a saved view) |

Derived `domains` columns:

| Column | Meaning |
| --- | --- |
| `listed` | Name is 9 characters or fewer (before `.ca`), with no dashes or digits. Only these rows are shown. Stored generated column. |
| `words`, `word_length` | Matched words, longest first, and the longest one's length |
| `score`, `segmented`, `segments` | See above |
| `kinds` | `SET` of the word kinds present, for the word-type filter |
| `date_auctioned` | Most recent auction this domain sold in |

`update.php` maintains these on insert, the API on `PUT`, and `backfill.php` for everything.

**Indexes.** `listed_filter` covers every filter and sort column. Counts and filtered pages are answered from it alone; the API names it in `FORCE INDEX`, because MySQL otherwise picks narrower indexes and reads every candidate row. Pages use a deferred join: ids come from the index, then only those rows are read. Typical requests take 15–150 ms over about 200,000 listed domains.

## Update agent

`bin/update.php` waits a random 10–300 seconds, then:

1. Runs `tbrCmd`. It inserts and scores new `(domain, date)` pairs and links their words.
2. Sets `date_removed` on upcoming domains that dropped off the list. If a removed domain was watched, it raises an alert.
3. Runs `resultsCmd`. If that auction is new, it records it, links and dates the sold domains, and raises an alert for any watched ones.
4. Raises an alert for each saved view with alerts on that matches domains added in this run.

Schedule it with an explicit interpreter. The file has CRLF line endings, so its shebang won't work if you run the file directly:

```cron
47 */2 * * * /usr/bin/php /opt/pandymic/tbr-check/bin/update.php >> /var/log/tbr-update.log 2>&1
```

## API

All routes are under `/api/v1`. Reads are open. Writes (`POST`, `PATCH`, `PUT`, `DELETE`) need an `X-Api-Token` header if `apiToken` is configured. CORS headers are only sent to local dev servers (`localhost`, `127.0.0.1`, `192.168.16.x`); the production client is same-origin.

| Method & path | Description |
| --- | --- |
| `GET /domains` | Filtered, sorted, paginated listing (see below) |
| `GET /domains/stats` | `{ upcoming, released, auctioned, auctionRate }` for the same filters, ignoring `status` |
| `GET /domains/export.csv` | The same listing as CSV, up to 10,000 rows |
| `GET /domains/facets` | `{ added: [dates], session: [dates] }` for the date filters. Cached for 5 minutes. |
| `GET /domains/{id}` | One domain, in the listing's shape |
| `PATCH /domains/{id}` | Any of `{ flag, note, maxBid }` |
| `PUT /domains/{id}` | Replace `name`, `tbr`, `added`, `removed`, `flag`. Recomputes derived data. |
| `GET /domains/{id}/words` | Dictionary words in the name, with kinds |
| `GET /words?prefix=sho&limit=20` | Word lookup for autocomplete: `[{ word, kind, domains }]`. Without `prefix`, returns the whole word list. |
| `GET /searches`, `POST /searches` | Saved views: `{ name, query, alert }` |
| `PATCH /searches/{id}`, `DELETE /searches/{id}` | Rename, change the query, toggle alerts; delete |
| `GET /alerts?limit=30` | `{ unseen, items: [{ id, created, type, message, seen, query, domain }] }` |
| `POST /alerts/seen` | Mark all alerts read |
| `GET /auth` | `{ required, ok }`: whether writes need a token, and whether the one sent is valid |

### Listing parameters

List values are comma-separated. All filters are optional and are combined with AND.

| Param | Example | Meaning |
| --- | --- | --- |
| `q` | `shop` | Name contains this text (2+ characters) |
| `flag` | `1` | Watched only |
| `minScore` | `60` | Score at least this |
| `segmented` | `1` | The name splits entirely into dictionary words |
| `word` | `app,nest` | Contains every one of these dictionary words (up to 5) |
| `kind` | `tech,place` | Contains a word of any of these kinds |
| `length` | `4-,6` | Name length excluding `.ca`: `n` exactly, `n-` n or fewer, `n+` n or more. A `+`/`-` pair forms a range, e.g. `3+,6-` means 3 to 6. |
| `wordLength` | `6+` | Same syntax, applied to the longest matched word |
| `added` | `2026-10-30` | Added on any of these days |
| `session` | `2026-11-04` | TBR session is any of these dates |
| `status` | `tbr,released,auctioned` | Any of these statuses |
| `sort`, `dir` | `score`, `desc` | `flag`, `name`, `score`, `words`, `tbr`, `added`, `status` or `id`; `asc` or `desc`. If omitted: unreleased first, then newest added. |
| `offset`, `limit` | `0`, `100` | `limit` is capped at 500 |
| `count` | `0` | Skip the total count, for follow-up pages |

Each item looks like this:

```json
{ "id": 3275023, "name": "appshop.ca", "tbr": "2026-11-04", "added": "2026-10-30 00:57:23",
  "removed": null, "auctioned": null, "status": "To Be Released",
  "flag": 0, "note": null, "maxBid": null,
  "score": 42, "segmented": true, "segments": "app|shop",
  "words": [ { "word": "shop", "kind": "common" }, { "word": "app", "kind": "tech" } ] }
```

## Client

```sh
npm start        # Vite dev server on :3000
npm test         # Vitest + Testing Library
npm run build    # production build into build/ (assets in build/static/)
```

To run the client against a different API, set `REACT_APP_BACKEND_API`, e.g. `REACT_APP_BACKEND_API=http://localhost:8080/api/v1 npm start`.

### Features

- **Upcoming first.** The app opens on unreleased domains, best score first. *Reset* returns to this view.
- **URL state.** Filters and sort live in the query string, so any view can be bookmarked or shared, and the back button works.
- **Views.**
  - Presets: upcoming best first, real words, 4 letters or less, watchlist, recently auctioned, everything.
  - Saved views: a toggle turns alerts on for new matches.
- **Alerts.** A bell shows unread alerts from the update agent. Clicking a match alert opens its view.
- **Score and words.**
  - Names are shown split into words (`app·nest`), with a score badge; hover it for the estimated auction odds.
  - Matched words appear as tags, coloured by kind. Clicking a tag filters to domains containing that word.
- **Filters:**
  - name length
  - minimum score, or real words only
  - contains word, with autocomplete
  - word type and longest-word length
  - session, date added and status
- **Stats.** Upcoming, released and auctioned counts for the current filters, with their historical auction rate.
- **Watchlist.** A checkbox watches a domain; the note icon adds a note and a max bid.
- **Export.** *CSV* downloads the current view.
- **WHOIS.** Hover a domain for a WHOIS link.
- **Chunked loading.** Rows load 100 at a time, prefetched 800px before the end, with a *Load more* fallback. Search is debounced, stale requests are cancelled, and flag changes are optimistic.
- **Layout.**
  - Desktop: the column headers stay pinned while scrolling.
  - Small screens: rows become labelled cards, and the filters fold into a toggle.

## Deployment

Apache serves the production site from `/var/www/internal/html/tbr`. That directory holds symlinks:

- `api.php` → `api/public/index.php`. API changes go live as soon as they're saved. The Apache rewrite rule sends `/tbr/api*` to `api.php`; Slim takes its base path from the script's directory.
- `index.html`, `static/`, `manifest.json` and the icons → `build/`. Run `npm run build` to deploy the client. (`asset-manifest.json` was a Create React App file and can be removed.)
