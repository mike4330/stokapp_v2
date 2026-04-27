"""Daily portfolio aggregate snapshot task.

Ports /var/www/html/portfolio/portstats2.php. For each transacted symbol with
an open position, computes position value + cost + realized P/L + cumulative
dividends, then aggregates across the portfolio. Reads existing rows of the
`historical` table to compute average-of-daily-return windows (WMA8..WMA160,
YMA1..YMA4) and INSERTs one row per day capturing all of the above.

Idempotent: skips today if a row already exists.

Schedule: weekdays 16:21 ET (matches legacy cron exactly).
"""
import logging
from dataclasses import dataclass
from datetime import date
from typing import List, Optional

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

# Legacy excludes SNP (S&P 500 benchmarking row, not a real holding)
EXCLUDED_SYMBOLS = {"SNP"}


@dataclass(frozen=True)
class ReturnAverage:
    """One historical-return rolling average to compute and persist.

    `column`   — name of the column in the `historical` table to write to.
    `lookback` — SQLite date-modifier string passed straight through to
                 `date('now', <lookback>)`. Use '-168 days' for trading-window
                 averages or '-N years' for multi-year (the latter handles
                 month/leap-year alignment, matching legacy semantics).
    `decimals` — rounding precision for the output value.
    """
    column: str
    lookback: str
    decimals: int = 3


# Active set: only the averages that the app actually reads downstream
# (charts and portfolio_performance_routes consume WMA24 + YMA1..YMA4).
# Add a ReturnAverage entry to extend; add the matching column to the
# INSERT below if it isn't already in the historical schema.
RETURN_AVERAGES: List[ReturnAverage] = [
    ReturnAverage("WMA24", "-168 days", decimals=3),
    ReturnAverage("YMA1",  "-1 years",  decimals=3),
    ReturnAverage("YMA2",  "-2 years",  decimals=3),
    ReturnAverage("YMA3",  "-3 years",  decimals=4),
    ReturnAverage("YMA4",  "-4 years",  decimals=4),
]


def _avg_return(db: Session, lookback: str) -> Optional[float]:
    """Mean of historical.return over rows where date >= now + <lookback>."""
    row = db.execute(
        text("SELECT AVG(return) FROM historical WHERE date >= date('now', :lookback)"),
        {"lookback": lookback},
    ).fetchone()
    return float(row[0]) if row and row[0] is not None else None


def _row_exists_for_today(db: Session, today: str) -> bool:
    row = db.execute(
        text("SELECT 1 FROM historical WHERE date = :today LIMIT 1"),
        {"today": today},
    ).fetchone()
    return row is not None


def update_portfolio_stats() -> bool:
    """Aggregate today's portfolio totals + WMA/YMA averages into `historical`."""
    today = date.today().isoformat()
    db = next(get_db())
    try:
        if _row_exists_for_today(db, today):
            logger.info(f"portfolio_stats: row already exists for {today}, skipping")
            return True

        # Universe: every symbol ever transacted, minus excluded benchmarks.
        # Closed positions filter naturally via net_units == 0 below.
        symbols = [
            row[0]
            for row in db.execute(
                text(
                    "SELECT DISTINCT symbol FROM transactions "
                    "ORDER BY symbol"
                )
            ).fetchall()
        ]
        symbols = [s for s in symbols if s not in EXCLUDED_SYMBOLS]

        total_value = 0.0
        total_cost = 0.0
        total_rgl = 0.0
        portfolio_divs = 0.0
        contributing = 0
        no_price = 0

        for symbol in symbols:
            shares = get_net_units(db, symbol)
            if shares <= 0:
                continue

            close = get_current_close(db, symbol)
            if close is None:
                logger.warning(f"portfolio_stats: no price for {symbol}, skipping")
                no_price += 1
                continue

            position_value = shares * close
            net_cost = get_cost_basis(db, symbol)
            realized_gain = get_cum_realized_gain(db, symbol)
            divs = get_cum_dividends(db, symbol)

            total_value += position_value
            total_cost += net_cost
            total_rgl += realized_gain
            portfolio_divs += divs
            contributing += 1

        if total_cost <= 0:
            logger.error(
                f"portfolio_stats: total_cost={total_cost:.2f} (no contributing positions); aborting insert"
            )
            return False

        total_value = round(total_value, 2)
        total_cost = round(total_cost, 2)
        total_ugl = round(total_value - total_cost, 2)
        net_gl = total_ugl + total_rgl + portfolio_divs
        total_return = round(100.0 * net_gl / total_cost, 2)

        avg_values = {}
        for spec in RETURN_AVERAGES:
            raw = _avg_return(db, spec.lookback)
            avg_values[spec.column] = round(raw, spec.decimals) if raw is not None else None

        # Build INSERT dynamically: fixed columns first, then whichever
        # averages are configured in RETURN_AVERAGES. Any historical column
        # not listed here stays NULL (intentional — only persisting what
        # the app actually reads).
        fixed_cols = ["date", "value", "cost", "dret", "return"]
        fixed_binds = [":date", ":value", ":cost", ":dret", ":ret"]
        avg_cols = [spec.column for spec in RETURN_AVERAGES]
        avg_binds = [f":{spec.column}" for spec in RETURN_AVERAGES]

        params = {
            "date": today,
            "value": total_value,
            "cost": total_cost,
            "dret": net_gl,
            "ret": total_return,
            **avg_values,
        }

        sql = (
            f"INSERT INTO historical ({', '.join(fixed_cols + avg_cols)}) "
            f"VALUES ({', '.join(fixed_binds + avg_binds)})"
        )
        db.execute(text(sql), params)
        db.commit()

        logger.info(
            f"portfolio_stats: contributing={contributing} no_price={no_price} "
            f"value={total_value} cost={total_cost} net_gl={net_gl:.2f} "
            f"return={total_return}%"
        )
        logger.info(f"portfolio_stats averages: {avg_values}")
        logger.info(f"portfolio_stats complete: inserted historical row for {today}")
        return True

    except Exception as e:
        logger.exception(f"portfolio_stats: task failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()
