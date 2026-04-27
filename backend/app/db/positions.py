"""Per-symbol position math helpers.

Single source of truth for net units, cost basis, cumulative dividends, and
cumulative realized gain — used by security_values_snapshot_task,
portfolio_stats_task, and any future task that needs the same numbers.

All queries assume the same `transactions` shape: rows have `xtype` in
{Buy, Sell, Div}, optional `units_remaining` (set when a Buy lot has been
partially closed), and `disposition` (set when a lot is fully closed).
"""
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


def get_net_units(db: Session, symbol: str) -> float:
    """Sum of units across open Buy lots, accounting for partial closes."""
    row = db.execute(
        text("""
            SELECT SUM(CASE
                WHEN units_remaining IS NULL THEN units
                ELSE units_remaining
            END)
            FROM transactions
            WHERE xtype = 'Buy'
              AND symbol = :symbol
              AND disposition IS NULL
        """),
        {"symbol": symbol},
    ).fetchone()
    return float(row[0]) if row and row[0] else 0.0


def get_cost_basis(db: Session, symbol: str) -> float:
    """Sum of price * units (or units_remaining if partial) across open Buy lots."""
    row = db.execute(
        text("""
            SELECT SUM(price * COALESCE(units_remaining, units))
            FROM transactions
            WHERE xtype = 'Buy'
              AND symbol = :symbol
              AND disposition IS NULL
        """),
        {"symbol": symbol},
    ).fetchone()
    return float(row[0]) if row and row[0] else 0.0


def get_cum_dividends(db: Session, symbol: str) -> float:
    """Lifetime sum of price * units across Div transactions."""
    row = db.execute(
        text("""
            SELECT IFNULL(SUM(price * units), 0)
            FROM transactions
            WHERE xtype = 'Div' AND symbol = :symbol
        """),
        {"symbol": symbol},
    ).fetchone()
    return float(row[0]) if row else 0.0


def get_cum_realized_gain(db: Session, symbol: str) -> float:
    """Lifetime sum of `gain` across Sell transactions."""
    row = db.execute(
        text("""
            SELECT IFNULL(SUM(gain), 0)
            FROM transactions
            WHERE xtype = 'Sell' AND symbol = :symbol
        """),
        {"symbol": symbol},
    ).fetchone()
    return float(row[0]) if row else 0.0


def get_current_close(db: Session, symbol: str) -> Optional[float]:
    """Latest price from the `prices` table, or None if absent."""
    row = db.execute(
        text("SELECT price FROM prices WHERE symbol = :symbol"),
        {"symbol": symbol},
    ).fetchone()
    return float(row[0]) if row and row[0] is not None else None
