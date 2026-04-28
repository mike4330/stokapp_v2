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

## Status snapshot
- **VPS bring-up:** repo cloned, venv built on Python 3.12.3, app boots, all 10 scheduler jobs register cleanly. Awaiting DNS, .env, real DB transfer, frontend, and systemd units before cutover.
- **Local env modernized:** Python 3.12.13 (deadsnakes), `venv-new` running prod, manifest curated + locked.
- **Cron migration:** 4 of 6 ported (`getxag`, `download`, `portstats2`, `hist2`); `updatedivs` still pending.
- **MPT modeling:** redirected to nightly scheduled job + params-only UI. Schema docs updated. DB tables next.
- **SEC sub-project:** fully expunged (1166 lines removed).

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
- [x] `python3 -m venv backend/venv` on enceladus (Python 3.12.3) — DONE
- [x] `pip install -r backend/requirements.txt` — clean (60 cp312 wheels)
- [x] Smoke test: `uvicorn` boots, scheduler registers all 10 jobs, endpoints return 200 — DONE on a side port
- [ ] Create `.env` on VPS (DB_PATH, METAL_PRICE_API_KEY, DATA_DIR=in-tree)
- [ ] systemd unit for uvicorn (model after FTM's `financial-tracker-backend.service`)

## Data
- [ ] Stop local backend cleanly (checkpoint WAL) before copying sqlite
- [ ] `scp backend/data/portfolio.sqlite*` to enceladus (replaces stale committed snapshot)
- [ ] `PRAGMA integrity_check` on remote
- [ ] Transfer the per-symbol CSVs in `backend/data/historical/` (gitignored — needs scp at cutover, OR fire `price_history_job` on VPS once running)
- [ ] ~~`sec_data.db`~~ — N/A, SEC sub-project expunged

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

## MPT modeling redirect

**Strategy change (2026-04-28):** The interactive "what-if" modeling UI is being
retired. The new shape: a **nightly scheduled job** runs one canonical model
(emulating legacy `/var/www/html/portfolio/currentmodel`), and the UI shrinks to
a **params-only editor** for the optimizer scalars + sector constraints.

Schema docs updated (`docs/schema.txt` regenerated, `docs/MPT_System_Documentation.md`
gained "Current Database State" + status banner).

Decisions locked in:
- **Single-row** `mpt_model_params` (no history; `mpt_results` already records gamma/lb/ub per run for past-run reproducibility).
- `MPT2` table is cruft — leave alone.
- Keep `expected_returns` writes (offline analysis use).

Not in scope: CVaR (`cvar-optimization-script.py`) and `opt4.py` are dropped.
Mean-variance only via `opt3.py`-equivalent.

### Done
- [x] **`opt3.py` switched to read from `HISTORICAL_DIR`** — no more in-script yfinance download; reads per-symbol CSVs produced by `price_history_job`. Handles BRK-B↔BRK.B filename translation.
- [x] **Schema documentation** — `docs/schema.txt` regenerated from live DB (added 4 missing tables, fixed types, annotated 9 cruft tables); `docs/MPT_System_Documentation.md` updated with status banner + tables-of-record matrix.

### Phase 1 — DB tables for params
- [ ] Migration: create `mpt_model_params` (single-row scalars: gamma, target_risk, weight_lower, weight_upper, gamma_smooth) and `mpt_sector_constraints` (sector PK, lower, upper)
- [ ] Seed `mpt_model_params` with current `currentmodel` values: γ=1.0929, target_risk=.1358, lb=0.00166, ub=0.046, gamma_smooth=0.37
- [ ] Seed `mpt_sector_constraints` with the 14 sector rows currently hardcoded in `opt3.py:53-88`

### Phase 2 — `mpt_model_run_task` scheduler job
- [ ] New task: load params from the two new tables, build wide DataFrame from `HISTORICAL_DIR`, run pypfopt (EfficientFrontier with `L2_with_weight_smoothing`, sector constraints, `efficient_risk(target_risk)`)
- [ ] Persist to `mpt_results` + `weights` + `expected_returns` (matching `opt3.py` today)
- [ ] Apply weights → `MPT.target_alloc` and `prices.alloc_target` (matching legacy `import.sh`)
- [ ] Schedule weekday evenings, **after** all upstream jobs (sector_pe at 17:30 → run model at 17:45 ET)
- [ ] Idempotency: skip insert into `mpt_results` if a run for today already exists? Or always insert (multiple runs per day are fine)? Decision needed.

### Phase 3 — Params UI
- [ ] `GET /api/mpt/params` — returns both tables
- [ ] `PUT /api/mpt/params` — atomic update of both
- [ ] New simplified page: `frontend/src/pages/MPTParams.tsx` — table view of params + sector constraints, edit + save, "Run Now" button (reuses `/scheduler/job/{id}/run-now`)
- [ ] Tear out the old `MPTModelling.tsx` (872 lines, what-if UI), `mpt_modeling.py` (in-memory task store), and the `/run-mpt-modeling` + `/task-status/{id}` stub endpoints
- [ ] Remove App.tsx route + Navbar link for the old MPTModelling page

### Phase 4 — Retire legacy CLI
- [ ] Once nightly job is verified, archive `/var/www/html/portfolio/opt3.py`, `opt4.py`, `cvar-optimization-script.py`, `currentmodel`, `import.sh`

## Cron jobs → app scheduler

Source: `/etc/cron.d/stockprice` plus manually-run scripts (`miscattr3.py`,
`utils/rsi.py`, `utils/pescrape.py`).
**Plan: migrate to the LOCAL app scheduler first, then carry over with the VPS.**

App scheduler currently registers 10 jobs in `backend/app/scheduler/jobs.py`:
`update_overamt`, `price_updater`, `moving_averages_job`, `xag_price_job`,
`btc_price_job`, `rsi_update_job`, `sector_pe_job`, `price_history_job`,
`security_values_snapshot_job`, `portfolio_stats_job`.

**Remaining cron entries:** rsync backup (separate concern), `updatedivs.sh`
(weekly Saturday — pending). Also pending: `metadata_scraper_task` (port of
`miscattr3.py`, off-hours weekday).

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

- [x] **`getxag.py` retired** — covered by `xag_price_job`; cron line commented out on local
- [x] **`download.py` retired** — port at `price_history_task.py` (registered as `price_history_job` weekdays 16:28 ET). Reads from DB, writes per-symbol CSVs to `HISTORICAL_DIR`. Includes BRK.B↔BRK-B translation.
- [x] **`portstats2.php` retired** — port at `portfolio_stats_task.py` (registered weekdays 16:21 ET). Per-symbol position math + portfolio totals + WMA/YMA averages, INSERT into `historical`. WMA/YMA windows extensible via `RETURN_AVERAGES` dataclass list. Verified byte-equal vs legacy.
- [x] **`hist2.sh` retired** — port at `security_values_snapshot_task.py` (registered weekdays 16:31 ET). Verified column-for-column match against legacy. Idempotent on (symbol, today). Position-math helpers extracted to shared `app/db/positions.py`.
- [ ] **`dividend_growth_update_task`** still pending (port of `updatedivs.sh` + `divgrowth.sh`)
  - Schedule Saturday 03:21 ET
  - Per-symbol pull with rate-limit (legacy uses 65s sleep — keep or replace with a real backoff)
  - Read `divgrowth.sh` to understand source/computation before porting (not yet read)
  - Write `prices.div_growth_rate`
- [ ] **Backups (separate from scheduler):** decide local strategy (keep `/disk2` rsync as-is for now) and VPS strategy (`/var/backups/mpmv2/` cron, or APScheduler job using `sqlite3 .backup`)
- [x] **Rollover discipline:** legacy `/etc/cron.d/stockprice` already has `getxag.py` and `download.py` lines commented out. Comment out `portstats2.php` and `hist2.sh` once those have run a few clean trading days alongside.

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
- [x] **`rsi_update_task`** — DONE (`rsi_task.py`, weekdays 16:40 ET, hand-rolled Wilder RSI via pandas EWMA, writes `MPT.RSI`)
- [x] **`sector_pe_scraper_task`** — DONE (`sector_pe_task.py`, weekdays 17:30 ET, writes `sectors.average_pe`, logs scraped-vs-DB diff per run)
- [ ] **`metadata_scraper_task`** still pending (port of `miscattr3.py`)
  - Schedule: weekdays AM, off-trading-window (e.g. 06:00 ET)
  - Per-ticker yfinance.Ticker.info pull with random 1–4s delay (matches legacy)
  - Writes MPT.{beta, pe, market_cap_val, market_cap, recm, industry, fcf_ni_ratio}
  - All deps already in venv

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
- [ ] _TBD — additional legacy CLI workflows surface as needed_

## Done in this migration cycle
- ✅ VPS clone + venv smoke test (Python 3.12.3)
- ✅ Local Python harmonized to 3.12 (deadsnakes); production swapped to `venv-new`
- ✅ Curated `backend/requirements.txt` + `requirements.lock.txt` committed
- ✅ Five scheduler tasks added: `rsi_update`, `sector_pe`, `price_history`, `security_values_snapshot`, `portfolio_stats`
- ✅ Position-math helpers extracted to `backend/app/db/positions.py`
- ✅ `legacy opt3.py` rewired to read from in-tree `HISTORICAL_DIR`
- ✅ SEC sub-project expunged (~1170 LOC, 14 files)
- ✅ `LotManager.tsx` filter improvements (P/L range + per-account toggles)
- ✅ Schema docs regenerated; `MPT_System_Documentation.md` updated with current-state matrix
