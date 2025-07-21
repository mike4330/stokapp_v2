"""Task for updating BTC-USD (Bitcoin) prices and moving averages."""
import yfinance as yf
import logging
import time
from datetime import datetime
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Price
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

def update_btc_price():
    """
    Update the BTC-USD (Bitcoin) price and moving averages in the database.
    Returns True if successful, False otherwise.
    """
    try:
        symbol = "BTC-USD"
        database_file = settings.DB_PATH

        # Get BTC data from yfinance with retry logic
        max_retries = 3
        retry_delay = 5  # seconds
        
        for attempt in range(max_retries):
            try:
                btc = yf.Ticker(symbol)
                info = btc.info
                break  # Success, exit retry loop
            except Exception as e:
                if "Rate limited" in str(e) or "Too Many Requests" in str(e):
                    if attempt < max_retries - 1:
                        logger.warning(f"Rate limited on attempt {attempt + 1}, retrying in {retry_delay} seconds...")
                        time.sleep(retry_delay)
                        retry_delay *= 2  # Exponential backoff
                        continue
                    else:
                        logger.error(f"Rate limited after {max_retries} attempts, giving up")
                        return False
                else:
                    # Non-rate-limit error, don't retry
                    raise e

        # Extract the required data
        current_price = info.get('regularMarketPrice')
        fifty_day_avg = info.get('fiftyDayAverage')
        two_hundred_day_avg = info.get('twoHundredDayAverage')
        timestamp = int(datetime.now().timestamp())

        # Validate that we got the required data
        if not current_price:
            logger.error(f"Could not get current price for {symbol}")
            return False

        if not fifty_day_avg:
            logger.warning(f"Could not get 50-day average for {symbol}")
            fifty_day_avg = None

        if not two_hundred_day_avg:
            logger.warning(f"Could not get 200-day average for {symbol}")
            two_hundred_day_avg = None

        # Use SQLAlchemy session for thread-safe database access
        db = next(get_db())
        try:
            # Check if BTC-USD already exists in the prices table
            existing_price = db.query(Price).filter(Price.symbol == symbol).first()

            if existing_price:
                # Update existing record
                existing_price.price = current_price
                existing_price.lastupdate = timestamp
                existing_price.mean50 = fifty_day_avg
                existing_price.mean200 = two_hundred_day_avg
            else:
                # Insert new record
                new_price = Price(
                    symbol=symbol,
                    price=current_price,
                    lastupdate=timestamp,
                    mean50=fifty_day_avg,
                    mean200=two_hundred_day_avg,
                    asset_class='CRYPTO'
                )
                db.add(new_price)

            db.commit()

            # Format the moving averages for logging
            fifty_ma_str = f"${fifty_day_avg:.2f}" if fifty_day_avg else "N/A"
            two_hundred_ma_str = f"${two_hundred_day_avg:.2f}" if two_hundred_day_avg else "N/A"
            
            logger.info(f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} Successfully updated {symbol}: "
                       f"Price=${current_price:.2f}, "
                       f"50MA={fifty_ma_str}, "
                       f"200MA={two_hundred_ma_str}")
            
            return True

        except Exception as db_error:
            db.rollback()
            logger.exception(f"Database error updating BTC price: {str(db_error)}")
            return False
        finally:
            db.close()

    except Exception as e:
        logger.exception(f"Unexpected error updating BTC price: {str(e)}")
        return False 