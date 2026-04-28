# MPMv2 Migration to Hetzner VPS (enceladus)

**Hostname:** `pm.roetto.org`
**Target path:** `/var/www/mpmv2/` (same as local)
**Repo:** `github.com/mike4330/stokapp_v2.git` (private)
**Stack (match local, no nginx, no TLS — personal single-user):**
- Backend: FastAPI + uvicorn on `127.0.0.1:8000` (bind to 0.0.0.0 if frontend proxy can't reach it — TBD)
- Frontend: CRA `react-scripts start` on a TBD port (3000 may be free on enceladus; pick e.g. `:3001` if not). Dev `proxy` → backend.
- Plain HTTP, accessed as `http://pm.roetto.org:<frontend-port>`
- SQLite at `backend/data/portfolio.sqlite`
Coexists with `/var/www/html/financial-transaction-manager/` (uses :5000).

## Open questions
- [ ] DNS: A record `pm.roetto.org` → enceladus IP (do we have access?)
- [ ] Pick frontend port (confirm :3000 free on enceladus, else :3001)
- [ ] Hetzner firewall / ufw — ensure chosen port is open inbound

## Pre-flight
- [ ] Back up / move stale dir: `mv /var/www/mpmv2 /var/www/mpmv2.old-20260427`
- [ ] SSH deploy key for `mike4330/stokapp_v2` on enceladus (current local remote uses a PAT in the URL — don't reuse)

## Repo bring-up
- [x] `git clone` stokapp_v2 into `/var/www/mpmv2` on enceladus — DONE (HTTPS+PAT URL)
- [x] HEAD matches local snapshot from earlier today

## Backend
- [ ] `python3 -m venv backend/venv` (Python 3.12 available)
- [ ] `pip install -r backend/requirements.txt`
- [ ] Copy `.env` / secrets from local (not in repo) — identify which files
- [ ] Smoke test: `uvicorn` boots, hits a route, reads DB
- [ ] systemd unit for uvicorn (model after FTM's `financial-tracker-backend.service`)

## Data
- [ ] Stop local backend cleanly (checkpoint WAL) before copying sqlite
- [ ] `scp backend/data/portfolio.sqlite*` to enceladus
- [ ] `PRAGMA integrity_check` on remote
- [ ] Decide on `sec_data.db` (also present locally) — copy or rebuild?

## Frontend
- [ ] `npm ci` on enceladus (do NOT copy node_modules)
- [ ] `HOST=0.0.0.0 PORT=<chosen> npm start` — verify it serves
- [ ] systemd unit for `react-scripts start` (long-running)

## Web exposure
- [ ] DNS `pm.roetto.org` → enceladus
- [ ] Open chosen frontend port in firewall (ufw / Hetzner cloud firewall)

## Cutover
- [ ] Enable + start systemd services
- [ ] End-to-end smoke: load app, API call, DB query
- [ ] Backup cron for `portfolio.sqlite`

## Cleanup
- [ ] Remove `/var/www/mpmv2.old-*`
- [ ] Note run/restart procedure somewhere durable

---

# Legacy app retirement (separate workstream)

The legacy app at `/var/www/html/portfolio/` has CLI workflows that must move
into the web app before the local PC can be retired. More items will be added
here as we walk through them.

## MPT modeling (first item)

**Today (legacy, manual CLI):**
- `opt3.py` — primary pypfopt EfficientFrontier run; reads `tickers.txt` + `sectormap.txt` from cwd; writes `weights` + `mpt_results` in SQLite. Sector bounds hardcoded inline.
- `opt4.py` — same engine, different bond split (32.5 vs 21.1).
- `cvar-optimization-script.py` — CVaR / tail-risk variant.
- Diagnostics (not core): `analyze_beta.py`, `analyze_variance.py`, `modelstab2.sh`.
- `mpt.php` dashboard logic — **already ported** to mpmv2 `/model-recommendations`.

**State of mpmv2 MPT code:**
- `backend/app/portfolio_optimization.py` — fetches prices & builds covariance, but never calls EfficientFrontier. **Engine is hollow.**
- `backend/app/mpt_modeling.py` — task runner, but in-memory dict (lost on restart).
- `backend/app/api/mptroutes.py` — picker fully ported; `/run-mpt-modeling` and `/task-status/{id}` are stubs.
- `frontend/src/pages/MPTModelling.tsx` — form exists w/ hardcoded sector constraints, doesn't actually drive a run.

### Phase 1 — make optimization actually run
- [ ] Finish `portfolio_optimization.run_optimization()` (call EfficientFrontier w/ gamma, bounds, sector constraints)
- [ ] Persist results to `mpt_results` + `weights`; replace in-memory task store with SQLite-backed `optimization_jobs` table
- [ ] Wire `/run-mpt-modeling` + `/task-status/{id}`; make form poll it

### Phase 2 — kill file-based config
- [ ] Migrate `tickers.txt` + `sectormap.txt` into a `ticker_config` table (cwd-relative file reads won't work on the VPS)
- [ ] Use existing `prices` / `security_values` as primary data source; yfinance only via scheduler refresh

### Phase 3 — finish the UI
- [ ] Form submits + polls; "save run" with a name; "allocation diff" view (current vs optimized + rebalance plan)
- [ ] CVaR as an optimization-type toggle (single branch in engine)

### Phase 4 — retire the CLI
- [ ] Optional APScheduler job for periodic auto-optimization
- [ ] Archive `/var/www/html/portfolio/opt*.py` + the CVaR script

### Open questions (need user decision)
- [ ] **Sector bounds source of truth:** (a) DB-backed `sector_constraints` table editable in UI, or (b) frontend supplies bounds w/ backend defaults? — gates Phase 1 design.
- [ ] Is `expected_returns.csv` still populated? `analyze_variance.py` needs it; nothing in mpmv2 produces it.
- [ ] Keep CVaR as a real option, or drop it (mean-variance only)?

## Cron jobs → app scheduler

Source: `/etc/cron.d/stockprice` (active uncommented entries only) plus 3 manually-run scripts (`miscattr3.py`, `utils/rsi.py`, `utils/pescrape.py`).
App scheduler already registers in `backend/app/scheduler/jobs.py`: `update_overamt`, `price_updater`, `moving_averages_job`, `xag_price_job`, `btc_price_job`.
**Plan: migrate to the LOCAL app scheduler first, then carry over with the VPS.**

### Architecture: build atomic, unify at the end

Build each task as an independent function in `backend/app/scheduler/tasks/` first — register each one as its own scheduler entry while iterating. **At the end**, consolidate by replacing per-task `add_job` calls with a small number of pipeline orchestrators that invoke the task functions in order with per-step `safe_run`. Target shape:

```
intraday_pulse           every 5 min, market hours      update_overamt
daily_morning            weekdays ~09:35                price_updater → metadata_scraper
daily_close_pipeline     weekdays ~16:25                mpt_price_history → portfolio_stats →
                                                        security_values_snapshot → moving_averages →
                                                        rsi_update → sector_pe_scraper
weekly_maintenance       Sat 03:21                      dividend_growth_update
```

Singletons that don't pipeline cleanly: `xag_price_job` (mid-day), `btc_price_job` (hourly) — leave alone or fold into `intraday_pulse`.

Why pipelines and not monoliths: failure isolation (one step failing logs + continues), explicit data-flow ordering instead of fragile time-based ordering, and each task stays independently callable from a "Run Now" UI / debug shell.

**Blocking-job concern: deferred.** Long-running scrapers (e.g. `metadata_scraper_task`) will be scheduled outside the trading day where concurrency with intraday jobs is low, so the default in-process executor is fine for now. Revisit `ProcessPoolExecutor` only if a future job needs to run during market hours alongside `intraday_pulse`.

### What each cron does (after reading the scripts)

**`download.py`** — `28 16 * * 1-5` (mike)
Pulls 10-year daily close prices via yfinance for the ticker list in `tickers.txt`, writes a combined `pricedataset2.csv` and one CSV per ticker. Confirmed: this feeds MPT modeling.
Overlap: **None**. App has `price_updater` (current prices only), not 10-year history dumps. Net new task.

**`portstats2.php`** — `21 16 * * 1-5` (root)
For each held symbol: net units, current price, position value, realized/unrealized P/L, cumulative dividends. Then portfolio totals + a long list of WMA windows (WMA8/24/28/36/41/48/55/64/72/88/110/135/160 + YMA1-4) computed from the `historical` table. Inserts a single daily row into `historical` with all those columns.
Overlap: **None for writes**. mpmv2 *reads* `historical.WMA24/YMA1-4/return` (`backend/app/db/crud.py` and `portfolio_performance_routes`) but nothing populates it. Net new task.

**`hist2.sh`** — `31 16 * * 1-5` (root)
For each held symbol, snapshots: close, shares, cost_basis (via `functions.php`), cum_divs, cbps, cum_real_gl into `security_values`. Then chains into `movingaverages.sh`.
Overlap: `moving_averages_job` already covers the chained step. The `security_values` write is **net new**. mpmv2 has no writer for this table.

**`updatedivs.sh`** — `21 3 * * 6` (mike, Saturday 3:21 AM)
For each tracked symbol, runs `datafiles/divgrowth.sh $symbol` with a 65s sleep between (rate-limited). Updates dividend-growth data; `prices.div_growth_rate` is the column mpmv2 reads.
Overlap: **None**. mpmv2 reads `div_growth_rate` but has no writer. Net new task.

**`getxag.py`** — `46 15 * * 1-5` (mike) — silver price.
Overlap: **YES**. `xag_price_job` already exists. Just verify the schedule matches and drop the cron line.

**rsync `portfolio.sqlite → /disk2/backup/hourly/`** — `*/30 * * * *` (root) — pure backup.
Not a scheduler task. Local `/disk2` won't exist on the VPS — needs a separate decision (APScheduler snapshot job vs host cron, target path).

### Action items — local first, then carry to VPS

- [ ] **Confirm `xag_price_job` covers `getxag.py`** — diff schedule + behavior, then comment out the cron line on the local PC
- [x] **`price_history_task`** (port of `download.py`) — DONE
  - Implemented at `backend/app/scheduler/tasks/price_history_task.py` (yfinance bulk download via curl_cffi chrome session, 10-yr window)
  - Registered as `price_history_job` weekdays 16:28 ET, fireable from `/settings/scheduler` "Run Now"
  - Symbol universe: `SELECT symbol FROM prices WHERE class IS NOT NULL` (excludes XAG, BTC-USD)
  - DB→YF symbol translation map (`BRK.B` → `BRK-B`); columns renamed back to DB form before writing so filenames match consumer expectations
  - Writes per-symbol CSVs in legacy format (date,close, no header) to `settings.HISTORICAL_DIR`
  - **`HISTORICAL_DIR` setting** added to `core/config.py`, default `/var/www/mpmv2/backend/data/historical`
  - **DATA_DIR flipped via `.env`** (local only — `.env` is gitignored) so `rsi_task` and `moving_averages_task` now read from the in-tree dir too
  - Legacy `/etc/cron.d/stockprice` `download.py` line is now redundant — comment out after a few days of verification
- [ ] **New task: `portfolio_stats_task`** (port of `portstats2.php`)
  - Schedule weekdays 16:21
  - Reproduce per-symbol position math + portfolio totals + WMA/YMA columns; INSERT daily row into `historical`
  - Reuse existing position/cost-basis logic where it already lives in mpmv2 (avoid re-implementing) — audit `db/crud.py` and `overamt_task.py` first
- [ ] **New task: `security_values_snapshot_task`** (port of `hist2.sh`)
  - Schedule weekdays 16:31
  - For each held symbol, INSERT into `security_values` (close, shares, cost_basis, cum_divs, cbps, cum_real_gl)
  - Drop the chained `movingaverages.sh` — `moving_averages_job` handles it
- [ ] **New task: `dividend_growth_update_task`** (port of `updatedivs.sh` + `divgrowth.sh`)
  - Schedule Saturday 03:21
  - Per-symbol pull with rate-limit (legacy uses 65s sleep — keep or replace with a real backoff)
  - Read `divgrowth.sh` to understand source/computation before porting (not yet read)
  - Write `prices.div_growth_rate`
- [ ] **Backups (separate from scheduler):** decide local strategy (keep `/disk2` rsync as-is for now) and VPS strategy (`/var/backups/mpmv2/` cron, or APScheduler job using `sqlite3 .backup`)
- [ ] **Rollover discipline:** when each new app task is live and verified locally, comment out the matching `/etc/cron.d/stockprice` line on the local PC to prevent double-runs

### Additional legacy scripts to schedule (not in `/etc/cron.d/stockprice`, run manually today)

**`miscattr3.py`** (`/var/www/html/portfolio/miscattr3.py`)
yfinance metadata scraper. Per ticker (skips a hardcoded ETF/bond exclusion list): fetches `Ticker.info`, computes FCF/NI from quarterly cashflow, classifies market cap (Micro/Small/Medium/Large/Mega), UPDATEs `MPT` set: `beta`, `pe`, `market_cap_val`, `market_cap` (label), `recm`, `industry`, `fcf_ni_ratio`. Random 1–4s delay between calls.
Overlap: **None — these are all columns mpmv2 reads but nothing writes**. The picker's z-score uses `fcf_ni_ratio` (weight -1.2), so this is load-bearing for `/api/model-recommendations` quality.
Deps: yfinance, curl_cffi, requests_cache, pandas, sqlite3 — all already in mpmv2 venv.

**`utils/rsi.py`**
Reads `../tickers.txt` and per-symbol CSVs (`<SYMBOL>.csv` — produced by `download.py`). Computes RSI via `pandas_ta.rsi()`, takes the latest value, UPDATEs `MPT.RSI`.
Overlap: **None — `MPT.RSI` column read by picker (z-score weight 1.1), nothing in mpmv2 writes it.**
Hard dependency on `download.py` having run first (or whatever replaces it — see `mpt_price_history_task` above).
Deps: `pandas_ta` is **NOT** in the mpmv2 venv currently — needs adding to `requirements.txt`. Or replace with a hand-rolled RSI (Wilder smoothing) using pandas, since pandas_ta has had maintenance gaps and just one use site.

**`utils/pescrape.py`**
Scrapes https://worldperatio.com/sp-500-sectors/ , parses the sector P/E table with BeautifulSoup, applies a `SECTOR_NAME_MAPPING` to align with internal sector names, UPDATEs `sectors.average_pe`.
Overlap: **None — `sectors.average_pe` read by picker (drives `PE_diff = pe - average_pe`), nothing in mpmv2 updates it.**
Deps: requests, beautifulsoup4 — both already present (bs4 is a yfinance transitive).
Risk: external scraper, fragile to upstream HTML changes — keep the table-class fallback logic when porting.

### Action items
- [ ] **New task: `metadata_scraper_task`** (port of `miscattr3.py`)
  - Schedule: weekly weekday morning (legacy doesn't have a fixed schedule — pick something reasonable, e.g. weekdays 06:00 ET)
  - Reuse the exclusion list, FCF/NI calc, market-cap labels; write to `MPT` table
  - Reuse cwd-independent ticker source (same `ticker_config` table from Phase 2 of cron migration)
- [x] **`rsi_update_task`** (port of `utils/rsi.py`) — DONE
  - Implemented at `backend/app/scheduler/tasks/rsi_task.py` (Wilder RSI via pandas EWMA, no pandas_ta dep)
  - Registered as `rsi_update_job` at weekdays 16:40 ET, fireable from `/settings/scheduler` "Run Now"
  - Reads CSVs from `settings.DATA_DIR`, now flipped via `.env` to `/var/www/mpmv2/backend/data/historical`
  - Writes `MPT.RSI`
- [x] **`sector_pe_scraper_task`** (port of `utils/pescrape.py`) — DONE
  - Implemented at `backend/app/scheduler/tasks/sector_pe_task.py` (3-tier table-class fallback, `SECTOR_NAME_MAPPING` preserved)
  - Registered as `sector_pe_job` at weekdays 17:30 ET, fireable from `/settings/scheduler` "Run Now"
  - Writes `sectors.average_pe`; logs scraped-vs-DB diff each run for upstream-change visibility
- [ ] **`metadata_scraper_task`** still pending (port of `miscattr3.py`)

## Local environment modernization

Done:
- `backend/requirements.lock.txt` — authoritative pin from running venv (peewee dropped; resolves transitively). Committed.
- `backend/requirements.txt` — curated top-level deps; fixes stale `pypfopt` → `pyportfolioopt==1.5.6`; adds `curl_cffi`/`requests`/`APScheduler` that the old file missed. Committed.
- Python 3.12.13 installed locally via deadsnakes PPA. System python (3.10) untouched; `python3.12` is a parallel binary.
- `backend/venv-new/` rebuilt on Python 3.12.13 from the curated `requirements.txt`. 60 packages, all `cp312` wheels, no source builds. Smoke-tested end-to-end (app imports, all 5 new task wrappers import, live endpoints respond on a side port).
- **Production swapped to `venv-new/`** — running uvicorn now on Python 3.12.13. Local + VPS now harmonized on the same minor.

Housekeeping (not blocking):
- [ ] After a day or two of clean trading-day runs on `venv-new`, retire the old environment:
  ```
  rm -rf backend/venv          # old 3.10 venv
  mv backend/venv-new backend/venv
  ```
  Then drop `backend/venv-new/` from `.gitignore` (the existing `backend/venv/` line covers the renamed dir). Restart uvicorn one more time on the renamed path.

## Other legacy items
- [ ] _TBD — user has more legacy CLI workflows to enumerate_
