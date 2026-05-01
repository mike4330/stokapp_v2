"""Migration 003 — UNIQUE INDEX on historical(date).

Schema-enforces "one row per date" in the historical table. Same class
of bug as the security_values double-write that migration 002 prevented:
on the 2026-04-28 transition day, the legacy portstats2.php cron and
the new portfolio_stats_task both inserted rows for the same date,
producing slightly different WMA values that downstream chart queries
reading via MAX(date) couldn't disambiguate.

Idempotent: dedupe-then-create-if-not-exists. Higher rowid wins on any
existing same-date collision (project standard same-day rule).

Run from backend/ with:
    venv/bin/python migrations/003_historical_unique_date.py
"""
import sqlite3
import sys


def run_migration(db_path: str):
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    dup_count = cur.execute("""
        SELECT COUNT(*) FROM historical
        WHERE rowid NOT IN (
            SELECT MAX(rowid) FROM historical GROUP BY date
        )
    """).fetchone()[0]
    if dup_count:
        print(f"Found {dup_count} duplicate rows; deleting (keeping highest rowid per date)")
        cur.execute("""
            DELETE FROM historical
            WHERE rowid NOT IN (
                SELECT MAX(rowid) FROM historical GROUP BY date
            )
        """)
    else:
        print("No duplicates found")

    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_historical_date
        ON historical(date)
    """)
    con.commit()

    idx = cur.execute(
        "SELECT name FROM sqlite_master "
        "WHERE type='index' AND name='uq_historical_date'"
    ).fetchone()
    total = cur.execute("SELECT COUNT(*) FROM historical").fetchone()[0]
    print(f"Migration 003 applied to {db_path}")
    print(f"  index: {idx[0] if idx else 'MISSING'}")
    print(f"  historical rows: {total}")

    con.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "data/portfolio.sqlite"
    run_migration(db_path)
