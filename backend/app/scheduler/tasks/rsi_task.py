"""RSI updater task.

Computes 14-day Wilder RSI per MPT-tracked symbol from the per-symbol CSVs
in settings.DATA_DIR, and writes the latest value into MPT.RSI.

Reads CSVs in the legacy format produced by /var/www/html/portfolio/download.py:
no header, two columns (date, close).
"""
import logging
import os
from typing import Optional

import pandas as pd
from sqlalchemy import text

from app.core.config import settings
from app.db.session import get_db

logger = logging.getLogger(__name__)

RSI_PERIOD = 14


def compute_rsi(close: pd.Series, period: int = RSI_PERIOD) -> Optional[float]:
    """Latest Wilder RSI for a series of closes; None if insufficient data."""
    series = pd.to_numeric(close, errors="coerce").dropna()
    if len(series) < period + 1:
        return None
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    valid = rsi.dropna()
    if valid.empty:
        return None
    return round(float(valid.iloc[-1]), 2)


def update_rsi() -> bool:
    """Update MPT.RSI for every symbol in the MPT table that has a CSV available."""
    db = next(get_db())
    try:
        symbols = [
            row[0]
            for row in db.execute(text("SELECT symbol FROM MPT")).fetchall()
        ]
        logger.info(f"RSI: processing {len(symbols)} symbols from MPT table")

        updated = 0
        missing_csv = 0
        insufficient = 0
        errors = 0

        for symbol in symbols:
            csv_file = os.path.join(settings.DATA_DIR, f"{symbol}.csv")
            if not os.path.exists(csv_file):
                logger.warning(f"RSI: CSV not found for {symbol}: {csv_file}")
                missing_csv += 1
                continue

            try:
                df = pd.read_csv(csv_file, header=None)
                if df.shape[1] < 2:
                    logger.warning(f"RSI: {csv_file} has <2 columns")
                    errors += 1
                    continue

                rsi_value = compute_rsi(df.iloc[:, 1])
                if rsi_value is None:
                    logger.warning(f"RSI: insufficient data for {symbol}")
                    insufficient += 1
                    continue

                db.execute(
                    text("UPDATE MPT SET RSI = :rsi WHERE symbol = :symbol"),
                    {"rsi": rsi_value, "symbol": symbol},
                )
                updated += 1
                logger.info(f"RSI {symbol}: {rsi_value}")

            except Exception as e:
                logger.error(f"RSI: error processing {symbol}: {e}")
                errors += 1
                continue

        db.commit()
        logger.info(
            f"RSI update complete: {updated} updated, "
            f"{missing_csv} missing CSV, {insufficient} insufficient data, "
            f"{errors} errors"
        )
        return True

    except Exception as e:
        logger.exception(f"RSI: task failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()
