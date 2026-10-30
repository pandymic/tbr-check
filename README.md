# TBR Check

Browse the list of `.ca` domains that CIRA is about to release ("To Be Released"), find short or word-like names worth bidding on, and flag the interesting ones.

It has three parts:

| Part | Where | What it does |
| --- | --- | --- |
| **Update agent** | `bin/update.php` | Run on a schedule. Pulls the current TBR list and auction results, and records added, removed and auctioned domains in MySQL. |
| **API** | `api/public/index.php` | Slim 3 REST API. Filters, sorts and pages the domain list in the database. |
| **Client** | `src/` | React 19 + Semantic UI table. Loads rows in chunks as you scroll. |

Shared PHP helpers (dictionary word matching, length filters) live in `lib/domains.php`.

```
api/
  migrations/        Schema changes, run in order as a MySQL admin
  public/index.php   API entry point
bin/
  update.php         Update agent (cron)
  backfill.php       Recompute derived columns
etc/config.php       Local config, not tracked
lib/domains.php      Shared PHP helpers
src/                 React client
var/en_CA.dic        Word list used for word matching
```

## Requirements

- PHP 8.1+ with `pdo_mysql` (tested on 8.4). Composer for `api/vendor`.
- MySQL 8.0+. The migrations use a stored generated column and a descending index.
- Node 18+ (tested on 22) for the client.

## Configuration

### `etc/config.php` (not tracked)

Returns an object. The API, update agent and backfill all read it:

```php
<?php
return (object)[
  'time' => time(),
  'words' => __DIR__ . '/../var/en_CA.dic',   // dictionary path
  'db' => (object)[ 'host' => '…', 'name' => '…', 'user' => '…', 'pass' => '…' ],
  'tbrCmd' => '…',      // command that prints the current TBR list as JSON: [{ "name", "date" }, …]
  'resultsCmd' => '…',  // command that prints the latest auction results as JSON: { releaseDate, numberOfDomainNames, domains: [{ domainName }, …] }
  'slim' => (object)[ 'config' => [ 'settings' => [ 'displayErrorDetails' => false ] ] ],
];
```

The app's database user only needs `SELECT, INSERT, UPDATE, DELETE`. Migrations need a user with `ALTER` and `CREATE`.

### `.env.local` (not tracked)

Build-time settings for the client. Create React App inlines these into the public bundle, so never put secrets here.

```
PUBLIC_URL=/tbr
REACT_APP_BACKEND_API=/tbr/api/v1
```

## Setup

```sh
composer install -d api
npm install --legacy-peer-deps   # some deps haven't declared React 19 support yet

# Database: apply each migration as an admin user, then fill the derived columns.
mysql -u root -p <db> < api/migrations/001_listing.sql
mysql -u root -p <db> < api/migrations/002_filter_index.sql
php bin/backfill.php
```

## Data model

`domains` holds one row per domain per TBR session (`UNIQUE (domain, date_tbr)`). `results` and `results_to_domains` record which domains were sold at each auction.

The listing is built from columns that are computed once and stored, so requests don't have to recompute them:

| Column | Meaning | Maintained by |
| --- | --- | --- |
| `listed` | Name is 9 characters or fewer (before `.ca`), with no dashes or digits. Only these rows are shown. | MySQL (stored generated column) |
| `words` | Comma-separated dictionary words found in the name, longest first | `update.php` on insert, the API on `PUT`, `backfill.php` |
| `word_length` | Length of the longest matched word | same as `words` |
| `date_auctioned` | Most recent auction this domain was sold in | `update.php` when linking results, `backfill.php` |

Status is derived from these columns: **Auctioned** if `date_auctioned` is set, otherwise **Released** if `date_removed` is set, otherwise **To Be Released**.

Every listing query starts from an index with `listed` as its first column. `listed_filter` covers all filterable columns, so counts and filtered page lookups never read table rows. Pages are fetched with a deferred join: the page's ids come from the index, and only those rows are read.

After editing `var/en_CA.dic`, run `php bin/backfill.php` to recompute `words`. It's safe to re-run and only writes rows that changed.

## Update agent

`bin/update.php` waits a random 10–300 seconds, then:

1. Runs `tbrCmd` and inserts any new `(domain, date)` pairs.
2. Sets `date_removed` on upcoming domains that dropped off the list.
3. Runs `resultsCmd`. If that auction isn't recorded yet, it saves the auction and links each sold domain.

Schedule it with an explicit interpreter, for example hourly. The file has CRLF line endings, so the shebang won't work if you run the file directly:

```cron
0 * * * * /usr/bin/php /opt/pandymic/tbr-check/bin/update.php >> /var/log/tbr-update.log 2>&1
```

## API

All routes are under `/api/v1`.

| Method & path | Description |
| --- | --- |
| `GET /domains` | Filtered, sorted, paginated listing (see below) |
| `GET /domains/facets` | `{ added: [dates], session: [dates] }` for the filter dropdowns. Cached for 5 minutes. |
| `GET /domains/{id}` | One domain |
| `PATCH /domains/{id}` | `{ flag: 0\|1 }`. Sets the flag only. |
| `PUT /domains/{id}` | Replace `name`, `tbr`, `added`, `removed`, `flag`. Recomputes derived columns. |
| `DELETE /domains/{id}` | Delete a domain |
| `GET /domains/{id}/words` | Dictionary words in a domain name |
| `GET /words` | The dictionary (loaded lazily, only for routes that need it) |

### `GET /domains` parameters

List values are comma-separated. All filters are optional and are combined with AND.

| Param | Example | Meaning |
| --- | --- | --- |
| `q` | `shop` | Name contains this text (ignored if shorter than 2 characters) |
| `flag` | `1` | Flagged only |
| `length` | `4-,6` | Name length (excluding `.ca`): `n` exactly, `n-` n or fewer, `n+` n or more. A `+`/`-` pair forms a range, e.g. `3+,6-` means 3 to 6. |
| `wordLength` | `6+` | Same syntax, applied to the longest matched word |
| `added` | `2026-10-21` | Added on any of these days |
| `session` | `2026-10-28` | TBR session date is any of these |
| `status` | `tbr,released,auctioned` | Any of these statuses |
| `sort`, `dir` | `name`, `asc` | `id`, `flag`, `name`, `added`, `tbr`, `status`, `words`; `asc` or `desc`. If omitted: unreleased first, then newest added. |
| `offset`, `limit` | `0`, `100` | `limit` is capped at 500 |
| `count` | `0` | Skip the total count, for follow-up pages |

Response:

```json
{ "total": 198500, "offset": 0, "limit": 100, "items": [
  { "id": 3271223, "name": "bookmily.ca", "tbr": "2026-10-28", "added": "2026-10-21 12:48:42",
    "removed": null, "auctioned": null, "flag": 0, "words": ["book", "boo", "mil"], "status": "To Be Released" }
] }
```

`total` is `null` when `count=0` is passed. `words` is left out when there are no matches.

CORS headers are only sent to clients on `192.168.16.0/24`.

## Client

```sh
npm start        # dev server on :3000
npm test         # Jest + Testing Library
npm run build    # production build into build/
```

How the client keeps loading light:

- **Chunked loading.** Rows load 100 at a time. An `IntersectionObserver` starts fetching the next chunk 800px before you reach the end of the table, with a *Load more* button as a fallback. Follow-up chunks skip the count query.
- **Request hygiene.** Search is debounced by 300 ms. Changing a filter or sort aborts any request still in flight, so stale responses never overwrite newer ones.
- **Optimistic flagging.** Toggling a flag updates the row immediately, sends a `PATCH`, and reverts the row if the request fails.
- **Smaller bundle.** Only the Semantic UI components the app uses are imported (`src/semantic.js`), not the full stylesheet.

## Deployment

The production site is served by Apache from `/var/www/internal/html/tbr`. That directory holds symlinks:

- `api.php` → `api/public/index.php`. API changes go live as soon as they're saved.
- `index.html`, `static/` and the other assets → `build/`. Run `npm run build` to deploy the client.

The Apache rewrite rule sends `/tbr/api*` to `api.php`.
