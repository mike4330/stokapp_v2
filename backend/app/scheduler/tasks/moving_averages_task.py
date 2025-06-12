"""
Implementation of the moving averages update task.

This module contains the functions for calculating and updating moving averages
and statistics in the portfolio database.
"""
import logging
from datetime import datetime
import pandas as pd
from sqlalchemy import text
from sqlalchemy.orm import Session
import os

from app.db.session import get_db
from app.core.config import settings

logger = logging.getLogger(__name__)

def calculate_moving_averages(db: Session, symbol: str, prices: pd.Series) -> dict:
    """
    Calculate moving averages and statistics for a given symbol.
    
    Args:
        db: Database session
        symbol: Stock symbol
        prices: Series of historical prices
        
    Returns:
        Dictionary containing calculated statistics
    """
    try:
        # Calculate 50-day and 200-day moving averages
        mean50 = prices.tail(51).mean()
        mean200 = prices.tail(201).mean()
        
        # Calculate statistics over last 252 days (trading year)
        last252 = prices.tail(252)
        sd = last252.std()
        min_ = last252.min()
        max_ = last252.max()
        mean = last252.mean()
        volat = sd / mean if mean != 0 else None
        
        # Get current price from DB
        price_query = text("SELECT price FROM prices WHERE symbol = :symbol")
        price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
        cprice = price_result[0] if price_result else None
        
        # Calculate additional metrics
        midpoint = (min_ + max_) / 2 if min_ is not None and max_ is not None else None
        hlr = cprice / max_ if cprice is not None and max_ not in (None, 0) else None
        
        return {
            "mean50": mean50,
            "mean200": mean200,
            "stdev": sd,
            "volat": volat,
            "hlr": hlr,
            "min": min_,
            "max": max_,
            "mean": mean
        }
        
    except Exception as e:
        logger.error(f"Error calculating statistics for {symbol}: {str(e)}")
        return None

def update_symbol_statistics(db: Session, symbol: str, stats: dict) -> bool:
    """
    Update the database with calculated statistics for a symbol.
    
    Args:
        db: Database session
        symbol: Stock symbol
        stats: Dictionary of calculated statistics
        
    Returns:
        True if update was successful, False otherwise
    """
    try:
        update_query = text("""
            UPDATE prices 
            SET mean50 = :mean50,
                mean200 = :mean200,
                stdev = :stdev,
                volat = :volat,
                hlr = :hlr,
                laststatupdate = :timestamp
            WHERE symbol = :symbol
        """)
        
        db.execute(update_query, {
            "symbol": symbol,
            "mean50": stats["mean50"],
            "mean200": stats["mean200"],
            "stdev": stats["stdev"],
            "volat": stats["volat"],
            "hlr": stats["hlr"],
            "timestamp": int(datetime.now().timestamp())
        })
        
        return True
        
    except Exception as e:
        logger.error(f"Error updating statistics for {symbol}: {str(e)}")
        return False

def run_moving_averages():
    """
    Update moving averages and statistics for all securities in the portfolio.
    
    This function:
    1. Gets all symbols with prices from the database
    2. For each symbol:
       a. Reads historical price data from CSV
       b. Calculates moving averages and statistics
       c. Updates the database with new values
    """
    logger.info("Starting moving averages update task")
    
    db = next(get_db())
    try:
        # Get all symbols with prices
        symbols_query = text("SELECT symbol FROM prices WHERE class IS NOT NULL ORDER BY symbol")
        symbols = db.execute(symbols_query).fetchall()
        
        update_count = 0
        error_count = 0
        
        for symbol_row in symbols:
            symbol = symbol_row[0]
            csv_file = os.path.join(settings.DATA_DIR, f"{symbol}.csv")
            
            if not os.path.exists(csv_file):
                logger.warning(f"CSV file for {symbol} not found: {csv_file}")
                continue
                
            try:
                # Read price data
                df = pd.read_csv(csv_file, header=None)
                if df.shape[1] < 2:
                    logger.warning(f"CSV file {csv_file} does not have at least 2 columns")
                    continue
                    
                prices = df.iloc[:, 1]
                
                # Calculate statistics
                stats = calculate_moving_averages(db, symbol, prices)
                if not stats:
                    error_count += 1
                    continue
                    
                # Update database
                if update_symbol_statistics(db, symbol, stats):
                    update_count += 1
                    logger.info(f"Updated statistics for {symbol}: mean50={stats['mean50']:.2f}, mean200={stats['mean200']:.2f}")
                else:
                    error_count += 1
                    
            except Exception as e:
                logger.error(f"Error processing {symbol}: {str(e)}")
                error_count += 1
                continue
        
        # Commit all changes
        db.commit()
        
        logger.info(f"Moving averages update completed: {update_count} symbols updated, {error_count} errors")
        return True
        
    except Exception as e:
        logger.error(f"Error in moving averages update task: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close() 