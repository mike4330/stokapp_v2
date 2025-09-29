"""Task for updating XAG (Silver) prices."""
import requests
import logging
from datetime import datetime
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Price
from sqlalchemy.orm import Session

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

        url = f"https://api.metalpriceapi.com/v1/latest?api_key={api_key}&base={base_currency}&currencies={target_currency}"

        response = requests.get(url)
        response.raise_for_status()  # Raise exception for bad status codes

        data = response.json()
        if target_currency not in data["rates"]:
            logger.error(f"Currency {target_currency} not found in API response")
            return False

        field_value = 1/(data["rates"][target_currency])
        ts = data["timestamp"]

        # Use SQLAlchemy session for thread-safe database access
        db = next(get_db())
        try:
            # Check if XAG already exists in the prices table
            existing_price = db.query(Price).filter(Price.symbol == target_currency).first()

            if existing_price:
                # Update existing record
                existing_price.price = field_value
                existing_price.lastupdate = ts
            else:
                # Insert new record
                new_price = Price(
                    symbol=target_currency,
                    price=field_value,
                    lastupdate=ts,
                    asset_class='METAL'
                )
                db.add(new_price)

            db.commit()

            logger.info(f"{ts} Successfully updated price for {target_currency}: {field_value}")
            return True

        except Exception as db_error:
            db.rollback()
            logger.exception(f"Database error updating XAG price: {str(db_error)}")
            return False
        finally:
            db.close()

    except requests.RequestException as e:
        logger.error(f"API request failed: {str(e)}")
        return False
    except Exception as e:
        logger.exception(f"Unexpected error updating XAG price: {str(e)}")
        return False 