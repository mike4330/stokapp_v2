"""10-year price history downloader task.

Ports /var/www/html/portfolio/download.py into the app scheduler.
Bulk-downloads 10 years of daily closes via yfinance (curl_cffi session,
chrome impersonation), and writes per-symbol CSVs to settings.HISTORICAL_DIR
in the legacy two-column (date, close) header-less format that
moving_averages_task and rsi_task already consume.
"""
import datetime as dt
import logging
import os
from typing import List, Tuple

import pandas as pd
import yfinance as yf
from curl_cffi import requests as curl_requests
from sqlalchemy import text

from app.core.config import settings
from app.db.session import get_db

logger = logging.getLogger(__name__)

LOOKBACK_DAYS = 3650  # 10 years
# Symbols we never want to send to yfinance (handled by their own jobs).
EXCLUDE_FROM_YF = {"XAG", "BTC-USD"}

# DB ticker -> yfinance ticker, when the two forms diverge.
# yfinance uses '-' for share class designations (Berkshire B = BRK-B);
# the portfolio DB uses '.' (BRK.B). Add entries as new mismatches surface.
DB_TO_YF_SYMBOL = {
    "BRK.B": "BRK-B",
}


def get_symbol_list() -> List[str]:
    """Symbols to download. Mirrors moving_averages_task's universe."""
    db = next(get_db())
    try:
        rows = db.execute(
            text("SELECT symbol FROM prices WHERE class IS NOT NULL ORDER BY symbol")
        ).fetchall()
        return [r[0] for r in rows if r[0] not in EXCLUDE_FROM_YF]
    finally:
        db.close()


def fetch_price_history(tickers: List[str]) -> pd.DataFrame:
    """Bulk-download daily closes for `tickers`. Returns wide DataFrame indexed by Date."""
    today = dt.date.today()
    start = today - dt.timedelta(days=LOOKBACK_DAYS)
    end = today + dt.timedelta(days=1)

    session = curl_requests.Session(impersonate="chrome")
    ohlc = yf.download(
        tickers,
        start=start,
        end=end,
        interval="1d",
        ignore_tz=True,
        session=session,
        progress=False,
        auto_adjust=False,
        group_by="column",
    )
    if "Close" not in ohlc:
        logger.error("yfinance response has no Close column")
        return pd.DataFrame()
    closes = ohlc["Close"].dropna(how="all")
    return closes


def write_per_symbol_csvs(closes: pd.DataFrame, out_dir: str) -> Tuple[int, int]:
    """Write `<SYMBOL>.csv` for each ticker. Returns (written, empty)."""
    os.makedirs(out_dir, exist_ok=True)
    written = 0
    empty = 0
    for col in closes.columns:
        series = closes[col].dropna()
        if series.empty:
            logger.warning(f"price_history: {col} has no data after dropna")
            empty += 1
            continue
        path = os.path.join(out_dir, f"{col}.csv")
        series.to_csv(path, index=True, header=False)
        written += 1
    return written, empty


def update_price_history() -> bool:
    """Orchestrator: list symbols -> bulk download -> write CSVs to HISTORICAL_DIR.

    Translates DB symbols (e.g. 'BRK.B') to yfinance form ('BRK-B') before the
    request, then renames returned columns back to DB form so the CSV filenames
    match what downstream consumers (rsi_task, moving_averages_task) expect.
    """
    db_tickers = get_symbol_list()
    if not db_tickers:
        logger.error("price_history: no symbols to download")
        return False

    yf_for_db = {db: DB_TO_YF_SYMBOL.get(db, db) for db in db_tickers}
    db_for_yf = {yf: db for db, yf in yf_for_db.items()}
    yf_tickers = list(db_for_yf.keys())

    translated = [(db, yf) for db, yf in yf_for_db.items() if db != yf]
    if translated:
        logger.info(f"price_history: symbol translations DB->YF: {translated}")
    logger.info(
        f"price_history: requesting {len(yf_tickers)} symbols, "
        f"{LOOKBACK_DAYS}-day window"
    )

    try:
        closes = fetch_price_history(yf_tickers)
    except Exception as e:
        logger.exception(f"price_history: yfinance bulk download failed: {e}")
        return False

    if closes.empty:
        logger.error("price_history: yfinance returned no usable data")
        return False

    requested_yf = set(yf_tickers)
    received_yf = set(closes.columns)
    missing_yf = sorted(requested_yf - received_yf)
    if missing_yf:
        # Report missing in DB form so logs match downstream filenames
        missing_db = sorted(db_for_yf[s] for s in missing_yf)
        logger.warning(f"price_history: yfinance returned no columns for: {missing_db}")

    # Rename columns yfinance->DB form so CSVs are written under DB symbol names
    closes = closes.rename(columns=db_for_yf)

    written, empty = write_per_symbol_csvs(closes, settings.HISTORICAL_DIR)
    logger.info(
        f"price_history complete: {written} CSVs written, "
        f"{empty} empty after dropna, {len(missing_yf)} missing from response, "
        f"out_dir={settings.HISTORICAL_DIR}"
    )
    return written > 0
