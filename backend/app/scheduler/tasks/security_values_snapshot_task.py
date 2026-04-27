"""Daily snapshot of per-symbol position values into `security_values`.

Ports /var/www/html/portfolio/hist2.sh (the bash + PHP cost-basis variant).
For every symbol with an open position, INSERTs one row per day with:
close, shares (net units), cost_basis, cum_divs, cbps, cum_real_gl.

The legacy script chained into movingaverages.sh after the inserts; that
step is already covered by moving_averages_job and is not reproduced here.

Idempotent: skips a symbol if a row for (symbol, today) is already present,
so manual Run Now invocations don't double-insert.
"""
import logging
from datetime import date

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.positions import (
    get_net_units,
    get_cost_basis,
    get_cum_dividends,
    get_cum_realized_gain,
    get_current_close,
)

logger = logging.getLogger(__name__)

# Mirror legacy hist2.sh: skip 0386.HK (Hong Kong-listed; legacy explicitly omitted)
EXCLUDED_SYMBOLS = {"0386.HK"}


def _row_exists_for_today(db: Session, symbol: str, today: str) -> bool:
    row = db.execute(
        text("""
            SELECT 1 FROM security_values
            WHERE symbol = :symbol AND timestamp = :today
            LIMIT 1
        """),
        {"symbol": symbol, "today": today},
    ).fetchone()
    return row is not None


def snapshot_security_values() -> bool:
    """Insert one daily snapshot row per held symbol into `security_values`."""
    today = date.today().isoformat()
    db = next(get_db())
    try:
        symbols = [
            row[0]
            for row in db.execute(
                text(
                    "SELECT symbol FROM prices "
                    "WHERE class IS NOT NULL ORDER BY symbol"
                )
            ).fetchall()
        ]
        symbols = [s for s in symbols if s not in EXCLUDED_SYMBOLS]
        logger.info(f"security_values_snapshot: processing {len(symbols)} symbols for {today}")

        inserted = 0
        skipped_no_position = 0
        skipped_existing = 0
        skipped_no_price = 0
        errors = 0

        for symbol in symbols:
            try:
                if _row_exists_for_today(db, symbol, today):
                    skipped_existing += 1
                    continue

                shares = get_net_units(db, symbol)
                if shares <= 0:
                    skipped_no_position += 1
                    continue

                close = get_current_close(db, symbol)
                if close is None:
                    logger.warning(f"security_values_snapshot: no price for {symbol}")
                    skipped_no_price += 1
                    continue

                cost_basis = get_cost_basis(db, symbol)
                cbps = cost_basis / shares if shares else 0.0
                cum_divs = get_cum_dividends(db, symbol)
                cum_real_gl = get_cum_realized_gain(db, symbol)

                db.execute(
                    text("""
                        INSERT INTO security_values
                            (symbol, timestamp, close, shares, cost_basis,
                             cum_divs, cbps, cum_real_gl)
                        VALUES
                            (:symbol, :timestamp, :close, :shares, :cost_basis,
                             :cum_divs, :cbps, :cum_real_gl)
                    """),
                    {
                        "symbol": symbol,
                        "timestamp": today,
                        "close": close,
                        "shares": shares,
                        "cost_basis": cost_basis,
                        "cum_divs": cum_divs,
                        "cbps": cbps,
                        "cum_real_gl": cum_real_gl,
                    },
                )
                inserted += 1
                logger.info(
                    f"security_values {symbol}: shares={shares:.4f} "
                    f"close={close} cost_basis={cost_basis:.2f} "
                    f"cbps={cbps:.4f} divs={cum_divs:.2f} rgl={cum_real_gl:.2f}"
                )
            except Exception as e:
                logger.exception(f"security_values_snapshot: error on {symbol}: {e}")
                errors += 1
                continue

        db.commit()
        logger.info(
            f"security_values_snapshot complete: {inserted} inserted, "
            f"{skipped_existing} already had today's row, "
            f"{skipped_no_position} no open position, "
            f"{skipped_no_price} no price, {errors} errors"
        )
        return True

    except Exception as e:
        logger.exception(f"security_values_snapshot: task failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()
