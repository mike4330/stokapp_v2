# test_db.py
import sqlite3
import time

def test_db_connection():
    start = time.time()
    print("Testing database connection")
    
    conn = sqlite3.connect('/var/www/html/portfolio/portfolio.sqlite', timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    
    try:
        print("Executing simple COUNT query")
        cursor = conn.execute("SELECT COUNT(*) FROM prices")
        count = cursor.fetchone()[0]
        print(f"Count result: {count}")
        
        print("Getting table names")
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        print(f"Tables: {tables}")
        
        end = time.time()
        print(f"Query completed in {end - start:.2f} seconds")
    except Exception as e:
        print(f"Error: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    test_db_connection()
