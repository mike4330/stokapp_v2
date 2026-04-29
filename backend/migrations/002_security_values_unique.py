"""Migration 002 — UNIQUE INDEX on security_values(symbol, timestamp).

Schema-enforces "one row per symbol per day" in the security_values table.
Prevents the double-insert bug we hit on 2026-04-28, where the legacy
hist2.sh cron and the new security_values_snapshot_task both wrote rows
for the same date — corrupting downstream chart queries that use
MAX(timestamp) to pick the "latest row per symbol".

Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS.

Prerequisites:
- Existing duplicate (symbol, timestamp) rows must be cleaned first or
  the index creation will fail with a constraint error. Run the dedupe
  block below if needed (it's a no-op when no dupes exist).

Run from backend/ with:
    venv/bin/python migrations/002_security_values_unique.py
"""
import sqlite3
import sys


def run_migration(db_path: str):
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    # Safety: dedupe before creating the unique index. Higher rowid wins
    # (consistent with project convention for resolving same-day collisions).
    dup_count = cur.execute("""
        SELECT COUNT(*) FROM security_values
        WHERE rowid NOT IN (
            SELECT MAX(rowid) FROM security_values GROUP BY symbol, timestamp
        )
    """).fetchone()[0]
    if dup_count:
        print(f"Found {dup_count} duplicate rows; deleting (keeping highest rowid per group)")
        cur.execute("""
            DELETE FROM security_values
            WHERE rowid NOT IN (
                SELECT MAX(rowid) FROM security_values GROUP BY symbol, timestamp
            )
        """)
    else:
        print("No duplicates found")

    cur.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_security_values_sym_ts
        ON security_values(symbol, timestamp)
    """)
    con.commit()

    # Verify
    idx = cur.execute(
        "SELECT name, sql FROM sqlite_master "
        "WHERE type='index' AND name='uq_security_values_sym_ts'"
    ).fetchone()
    total = cur.execute("SELECT COUNT(*) FROM security_values").fetchone()[0]
    print(f"Migration 002 applied to {db_path}")
    print(f"  index: {idx[0] if idx else 'MISSING'}")
    print(f"  security_values rows: {total}")

    con.close()


if __name__ == "__main__":
    db_path = sys.argv[1] if len(sys.argv) > 1 else "data/portfolio.sqlite"
    run_migration(db_path)
