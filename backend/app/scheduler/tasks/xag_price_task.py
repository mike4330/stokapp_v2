"""Task for updating XAG (Silver) prices."""
import requests
import sqlite3
import logging
from datetime import datetime
from app.core.config import settings

logger = logging.getLogger(__name__)

def update_xag_price():
    """
    Update the XAG (Silver) price in the database.
    Returns True if successful, False otherwise.
    """
    try:
        # Get API key from settings
        api_key = settings.METAL_PRICE_API_KEY
        if not api_key:
            logger.error("Metal Price API key not configured")
            return False

        base_currency = "USD"
        target_currency = "XAG"
        database_file = settings.DB_PATH  # Use DB_PATH directly

        url = f"https://api.metalpriceapi.com/v1/latest?api_key={api_key}&base={base_currency}&currencies={target_currency}"

        response = requests.get(url)
        response.raise_for_status()  # Raise exception for bad status codes

        data = response.json()
        if target_currency not in data["rates"]:
            logger.error(f"Currency {target_currency} not found in API response")
            return False

        field_value = 1/(data["rates"][target_currency])
        ts = data["timestamp"]

        # Connect to the SQLite database
        conn = sqlite3.connect(database_file)
        cursor = conn.cursor()

        # Update the prices table
        sql = """
            UPDATE prices
            SET price = ?, lastupdate = ?
            WHERE symbol = ?
        """
        cursor.execute(sql, (field_value, ts, target_currency))
        conn.commit()

        logger.info(f"{ts} Successfully updated price for {target_currency}: {field_value}")
        return True

    except requests.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return False
    except sqlite3.Error as e:
        logger.error(f"Database error: {str(e)}")
        return False
    except Exception as e:
        logger.exception(f"Unexpected error updating XAG price: {str(e)}")
        return False
    finally:
        if 'conn' in locals():
            cursor.close()
            conn.close() 