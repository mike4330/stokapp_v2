from .moving_averages_config import DATABASE_PATH, DATAFILE_PATH
import os
import sqlite3
import pandas as pd
import logging
import time

def main():
    # Set up logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')

    # Change to working directory
    os.chdir(DATAFILE_PATH)

    conn = sqlite3.connect(DATABASE_PATH)
    cursor = conn.cursor()

    # Get symbols
    cursor.execute("SELECT symbol FROM prices WHERE class IS NOT NULL ORDER BY symbol")
    symbols = [row[0] for row in cursor.fetchall()]

    for sym in symbols:
        csv_file = f"{sym}.csv"
        if not os.path.exists(csv_file):
            logging.warning(f"CSV file for {sym} not found: {csv_file}")
            continue
        try:
            df = pd.read_csv(csv_file, header=None)
        except Exception as e:
            logging.error(f"Error reading {csv_file}: {e}")
            continue
        if df.shape[1] < 2:
            logging.warning(f"CSV file {csv_file} does not have at least 2 columns.")
            continue
        prices = df.iloc[:, 1]

        # 50-day and 200-day moving averages
        mean50 = prices.tail(51).mean()
        cursor.execute("UPDATE prices SET mean50 = ? WHERE symbol = ?", (mean50, sym))
        mean200 = prices.tail(201).mean()
        cursor.execute("UPDATE prices SET mean200 = ? WHERE symbol = ?", (mean200, sym))

        # Stats over last 252 days
        last252 = prices.tail(252)
        sd = last252.std()
        min_ = last252.min()
        max_ = last252.max()
        mean = last252.mean()
        volat = sd / mean if mean != 0 else None

        # Get current price from DB
        cursor.execute("SELECT price FROM prices WHERE symbol = ?", (sym,))
        row = cursor.fetchone()
        cprice = row[0] if row else None
        midpoint = (min_ + max_) / 2 if min_ is not None and max_ is not None else None
        hlr = cprice / max_ if cprice is not None and max_ not in (None, 0) else None
        ts = int(time.time())

        # Update DB
        cursor.execute(
            "UPDATE prices SET stdev = ?, laststatupdate = ?, volat = ?, hlr = ? WHERE symbol = ?",
            (sd, ts, volat, hlr, sym)
        )
        conn.commit()

        logging.info(f"{sym} min: {min_}  max: {max_}  HLR {hlr} volat {volat} mean {mean}")
        print(f"{sym} {mean50}")

    conn.close()

if __name__ == "__main__":
    main() 