"""Migration 001 — MPT model config tables.

Creates three tables that capture the inputs currently scattered across
/var/www/html/portfolio/{tickers.txt, sectormap.txt} and /var/www/html/portfolio/
{currentmodel, opt3.py} hardcoded constants:

    mpt_model_params         single-row optimizer scalars
                             (replaces currentmodel CLI args + opt3.py gamma_smooth)
    mpt_sector_constraints   per-sector lower/upper allocation bounds
                             (replaces opt3.py sector_lower / sector_upper dicts)
    mpt_universe             tracked-symbol universe + sector classification
                             (replaces tickers.txt + sectormap.txt;
                             in_modeling=1 ⇔ symbol was in tickers.txt)

Idempotent: CREATE IF NOT EXISTS + INSERT OR REPLACE on params/constraints,
INSERT OR IGNORE on universe (so manual edits to existing rows survive re-runs).

Run from backend/ with:
    venv/bin/python migrations/001_mpt_config.py
"""
import sqlite3
import sys
from datetime import datetime
from pathlib import Path


# Seed values from /var/www/html/portfolio/currentmodel
INITIAL_PARAMS = {
    "gamma":        1.0929,
    "target_risk":  0.1358,
    "weight_lower": 0.00166,
    "weight_upper": 0.046,
    "gamma_smooth": 0.37,
}

# Seed values resolved from opt3.py:39-88
# bonds_total=0.211, dbonds_share=0.694, baseline_lower=0.0624, tolerance=0.01
_BONDS_TOTAL = 0.211
_DBONDS_SHARE = 0.694
_BASELINE = 0.0624
_TOLERANCE = 0.01

INITIAL_SECTOR_CONSTRAINTS = [
    # (sector, lower, upper)
    ("DBonds",                 _BONDS_TOTAL * _DBONDS_SHARE,
                               _BONDS_TOTAL * _DBONDS_SHARE + _TOLERANCE),
    ("FBonds",                 _BONDS_TOTAL * (1 - _DBONDS_SHARE),
                               _BONDS_TOTAL * (1 - _DBONDS_SHARE) + _TOLERANCE),
    ("Commodities",            0.025,    0.058),
    ("Communication Services", _BASELINE, _BASELINE + _TOLERANCE),
    ("Consumer Discretionary", _BASELINE, _BASELINE + _TOLERANCE),
    ("Consumer Staples",       _BASELINE, _BASELINE + _TOLERANCE),
    ("Energy",                 _BASELINE, _BASELINE + _TOLERANCE),
    ("Financials",             _BASELINE, _BASELINE + _TOLERANCE),
    ("Healthcare",             _BASELINE, _BASELINE + _TOLERANCE),
    ("Industrials",            _BASELINE, _BASELINE + _TOLERANCE),
    ("Materials",              _BASELINE, _BASELINE + _TOLERANCE),
    ("Tech",                   _BASELINE, 0.0692),
    ("Real Estate",            0.0606,   0.0698),
    ("Precious Metals",        0.0360,   0.0520),
    ("Utilities",              0.0615,   0.0638),
]

# Legacy file paths (read once at migration time; not consulted thereafter)
LEGACY_TICKERS_FILE = Path("/var/www/html/portfolio/tickers.txt")
LEGACY_SECTORMAP_FILE = Path("/var/www/html/portfolio/sectormap.txt")

# YF -> DB form translation for symbol names. tickers.txt and sectormap.txt
# both use yfinance form (BRK-B); mpmv2 stores DB form (BRK.B).
YF_TO_DB = {"BRK-B": "BRK.B"}


def yf_to_db(sym: str) -> str:
    return YF_TO_DB.get(sym, sym)


def load_legacy_universe():
    """Read tickers.txt + sectormap.txt and return (sector_map, modeling_set)."""
    if not LEGACY_TICKERS_FILE.exists():
        print(f"WARN: {LEGACY_TICKERS_FILE} not found — skipping universe seed")
        return None, None
    if not LEGACY_SECTORMAP_FILE.exists():
        print(f"WARN: {LEGACY_SECTORMAP_FILE} not found — skipping universe seed")
        return None, None

    with LEGACY_TICKERS_FILE.open() as f:
        modeling = {
            yf_to_db(line.strip())
            for line in f
            if line.strip() and not line.startswith("#")
        }

    sector_map = {}
    with LEGACY_SECTORMAP_FILE.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "," not in line:
                continue
            sym, sector = line.split(",", 1)
            sector_map[yf_to_db(sym.strip())] = sector.strip()

    return sector_map, modeling


def run_migration(db_path: str):
    now = datetime.now().isoformat(timespec="seconds")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # ---- mpt_model_params (single-row) ----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mpt_model_params (
            id           INTEGER PRIMARY KEY CHECK (id = 1),
            gamma        REAL NOT NULL,
            target_risk  REAL NOT NULL,
            weight_lower REAL NOT NULL,
            weight_upper REAL NOT NULL,
            gamma_smooth REAL NOT NULL DEFAULT 0.37,
            updated_at   TEXT NOT NULL,
            updated_by   TEXT,
            notes        TEXT
        )
    """)
    cur.execute("""
        INSERT OR REPLACE INTO mpt_model_params
            (id, gamma, target_risk, weight_lower, weight_upper, gamma_smooth,
             updated_at, updated_by, notes)
        VALUES (1, :gamma, :target_risk, :weight_lower, :weight_upper,
                :gamma_smooth, :ts, 'migration_001', :notes)
    """, {**INITIAL_PARAMS, "ts": now,
          "notes": "Seeded from /var/www/html/portfolio/currentmodel + opt3.py"})

    # ---- mpt_sector_constraints ----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mpt_sector_constraints (
            sector     TEXT PRIMARY KEY,
            lower      REAL NOT NULL,
            upper      REAL NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)
    for sector, lower, upper in INITIAL_SECTOR_CONSTRAINTS:
        cur.execute("""
            INSERT OR REPLACE INTO mpt_sector_constraints
                (sector, lower, upper, updated_at)
            VALUES (?, ?, ?, ?)
        """, (sector, lower, upper, now))

    # ---- mpt_universe (symbols + sector classification) ----
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mpt_universe (
            symbol      TEXT PRIMARY KEY,
            sector      TEXT NOT NULL,
            in_modeling INTEGER NOT NULL DEFAULT 0,
            notes       TEXT,
            updated_at  TEXT NOT NULL
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mpt_universe_modeling
        ON mpt_universe(in_modeling) WHERE in_modeling = 1
    """)

    sector_map, modeling = load_legacy_universe()
    if sector_map is not None:
        # INSERT OR IGNORE so re-running the migration doesn't clobber UI edits
        for sym, sector in sector_map.items():
            in_modeling = 1 if sym in modeling else 0
            cur.execute("""
                INSERT OR IGNORE INTO mpt_universe
                    (symbol, sector, in_modeling, updated_at)
                VALUES (?, ?, ?, ?)
            """, (sym, sector, in_modeling, now))

    con.commit()

    # ---- Report ----
    print(f"Migration 001 applied to {db_path}")
    p = cur.execute("SELECT * FROM mpt_model_params WHERE id = 1").fetchone()
    if p:
        print(f"  mpt_model_params: gamma={p[1]} target_risk={p[2]} "
              f"weight_lower={p[3]} weight_upper={p[4]} gamma_smooth={p[5]}")
    sc_count = cur.execute("SELECT COUNT(*) FROM mpt_sector_constraints").fetchone()[0]
    print(f"  mpt_sector_constraints: {sc_count} sectors")
    u_total = cur.execute("SELECT COUNT(*) FROM mpt_universe").fetchone()[0]
    u_modeling = cur.execute(
        "SELECT COUNT(*) FROM mpt_universe WHERE in_modeling = 1"
    ).fetchone()[0]
    print(f"  mpt_universe: {u_total} total symbols, {u_modeling} in modeling set")

    con.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "data/portfolio.sqlite"
    run_migration(db_path)
