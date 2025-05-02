"""
Implementation of the price updater task.

This module contains the functions for updating stock prices from external sources.
"""
import logging
from datetime import datetime
import time
import random
from random import randint, shuffle
from time import sleep

# Dependencies from reference code
import yfinance as yf
import requests_cache
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

logger = logging.getLogger(__name__)

def update_prices():
    """
    Update stock prices from external sources.
    
    This function maintains the original loopprices.py logic of running in a loop
    until market close. When called by the scheduler at 9:35 AM, it will run continuously
    until 4 PM, updating prices with random intervals between updates.
    """
    logger.info("Starting price update task")
    
    # Create a cached session for yfinance to reduce API load
    session = requests_cache.CachedSession("yfinance.cache", expire_after=45)
    
    now = datetime.now()
    logger.info(f"Price updater starting at {now.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Check if we're outside market hours (after 4 PM)
    if now.hour >= 16:
        logger.info("Outside of market hours, exiting price updater")
        return True
    
    db = next(get_db())
    try:
        # Get all symbols to update
        symbol_query = text("SELECT DISTINCT symbol FROM transactions ORDER BY symbol")
        result = db.execute(symbol_query)
        tickers = [row[0] for row in result]
        
        if not tickers:
            logger.warning("No symbols found to update prices for")
            return False
        
        # Randomize the order of tickers
        random.shuffle(tickers)
        
        # Main loop - runs until market close (4 PM)
        hour = now.hour
        logger.info(f"Starting price update loop with {len(tickers)} symbols")
        
        while hour < 16:
            starttime = time.time()
            logger.info("Starting price update cycle")
            
            for ticker in tickers:
                # Skip certain funds after 10 AM (as in the original code)
                if now.hour > 10 and ticker in ['FNBGX', 'FAGIX', 'FDGFX']:
                    continue
                    
                try:
                    # Fetch the current price
                    stock = yf.Ticker(ticker, session=session)
                    price = stock.fast_info["last_price"]
                    price = round(price, 8)
                    
                    if price is None:
                        logger.warning(f"Bad data for {ticker}, skipping")
                        continue
                        
                    ts = time.time()
                    logger.info(f"Price update for {ticker}: {price}")
                    
                    # Handle the BRK-B case (as in the original code)
                    if ticker == "BRK-B":
                        ticker = "BRK.B"
                        
                    # Update the price in the database
                    update_query = text("""
                        UPDATE prices 
                        SET price = :price, lastupdate = :ts 
                        WHERE symbol = :ticker
                    """)
                    
                    db.execute(update_query, {
                        "price": price,
                        "ts": ts,
                        "ticker": ticker
                    })
                    db.commit()
                    
                except Exception as e:
                    logger.error(f"Error updating price for {ticker}: {str(e)}")
                    continue
                
                # Random wait between symbols (as in the original code)
                waitint = (randint(1, 6500) / 1000)
                sleep(waitint)
            
            # Calculate elapsed time for this cycle
            elapsed = round((time.time() - starttime), 1)
            logger.info(f"Finished price update cycle. Elapsed time: {elapsed}s")
            
            # Random wait between cycles (as in the original code)
            cyclewait = randint(15, 45)
            logger.info(f"Waiting {cyclewait}s before next cycle")
            time.sleep(cyclewait)
            
            # Update the current time
            now = datetime.now()
            hour = now.hour
        
        logger.info("Market closed, ending price update loop")
        return True
        
    except Exception as e:
        logger.error(f"Error in price update task: {str(e)}")
        return False
    finally:
        db.close() 