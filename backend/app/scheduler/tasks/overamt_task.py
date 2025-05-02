"""
Implementation of the overamt update task.

This module contains the functions for calculating and updating overamt values
in the portfolio database.
"""
import logging
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db

logger = logging.getLogger(__name__)

def calculate_portfolio_value(db: Session) -> float:
    """
    Calculate the total portfolio value based on current positions.
    """
    portfolio_value = 0.0
    
    try:
        # Get all distinct symbols from transactions
        symbol_query = text("SELECT DISTINCT symbol FROM transactions ORDER BY symbol")
        symbols = db.execute(symbol_query).fetchall()
        
        for symbol_row in symbols:
            symbol = symbol_row[0]
            
            # Calculate net units for the symbol
            buy_units_query = text("""
                SELECT SUM(units) AS buy_units 
                FROM transactions 
                WHERE xtype = 'Buy' AND symbol = :symbol
            """)
            buy_units_result = db.execute(buy_units_query, {"symbol": symbol}).fetchone()
            buy_units = buy_units_result[0] or 0
            
            sell_units_query = text("""
                SELECT SUM(units) AS sell_units 
                FROM transactions 
                WHERE xtype = 'Sell' AND symbol = :symbol
            """)
            sell_units_result = db.execute(sell_units_query, {"symbol": symbol}).fetchone()
            sell_units = sell_units_result[0] or 0
            
            net_units = buy_units - sell_units
            
            # Skip if no position in this symbol
            if net_units <= 0:
                continue
            
            # Get current price for the symbol
            price_query = text("SELECT price FROM prices WHERE symbol = :symbol")
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            
            if not price_result:
                logger.warning(f"No price found for symbol {symbol}")
                continue
                
            current_price = price_result[0]
            
            # Calculate position value and add to total
            position_value = net_units * current_price
            portfolio_value += position_value
            
        logger.info(f"Calculated portfolio value: ${portfolio_value:.2f}")
        return portfolio_value
        
    except Exception as e:
        logger.error(f"Error calculating portfolio value: {str(e)}")
        return 0.0

def get_position_value(db: Session, symbol: str) -> float:
    """
    Calculate the current value of a position for a given symbol.
    """
    try:
        # Calculate net units for the symbol
        buy_units_query = text("""
            SELECT SUM(units) AS buy_units 
            FROM transactions 
            WHERE xtype = 'Buy' AND symbol = :symbol
        """)
        buy_units_result = db.execute(buy_units_query, {"symbol": symbol}).fetchone()
        buy_units = buy_units_result[0] or 0
        
        sell_units_query = text("""
            SELECT SUM(units) AS sell_units 
            FROM transactions 
            WHERE xtype = 'Sell' AND symbol = :symbol
        """)
        sell_units_result = db.execute(sell_units_query, {"symbol": symbol}).fetchone()
        sell_units = sell_units_result[0] or 0
        
        net_units = buy_units - sell_units
        
        # Get current price for the symbol
        price_query = text("SELECT price FROM prices WHERE symbol = :symbol")
        price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
        
        if not price_result:
            logger.warning(f"No price found for symbol {symbol}")
            return 0.0
            
        current_price = price_result[0]
        
        # Calculate position value
        position_value = net_units * current_price
        return position_value
        
    except Exception as e:
        logger.error(f"Error calculating position value for {symbol}: {str(e)}")
        return 0.0

def run_update():
    """
    Update overamt values for all securities in the portfolio.
    
    This function:
    1. Calculates the total portfolio value
    2. For each symbol in the MPT table:
       a. Calculates the target value based on target allocation
       b. Gets the current position value
       c. Calculates the difference (overamt)
       d. Updates the overamt and flag values in the MPT table
    """
    logger.info("Starting update_overamt_values implementation")
    
    db = next(get_db())
    try:
        # Calculate total portfolio value
        portfolio_value = calculate_portfolio_value(db)
        
        if portfolio_value <= 0:
            logger.error("Portfolio value is zero or negative, cannot update overamt values")
            return False
            
        # Get all symbols with target allocations from MPT table
        symbols_query = text("SELECT symbol, target_alloc FROM MPT ORDER BY symbol")
        symbols = db.execute(symbols_query).fetchall()
        
        update_count = 0
        for symbol_row in symbols:
            symbol = symbol_row[0]
            target_alloc = symbol_row[1]
            
            # Calculate target value for this symbol
            target_value = round(target_alloc * portfolio_value, 2)
            
            # Skip if target value is zero
            if target_value == 0:
                continue
                
            # Get current position value
            position_value = get_position_value(db, symbol)
            
            # Calculate difference (overamt)
            diff_amount = round(position_value - target_value, 2)
            
            # Update flag based on diff_amount
            if diff_amount < -1:
                flag = 'U'  # Underweight
            elif diff_amount > -1 and diff_amount < 0:
                flag = 'H'  # Hold
            else:
                flag = 'O'  # Overweight
                
            # Update the MPT table with new overamt and flag values
            update_query = text("""
                UPDATE MPT 
                SET overamt = :diff_amount, flag = :flag 
                WHERE symbol = :symbol
            """)
            
            db.execute(update_query, {
                "diff_amount": diff_amount,
                "flag": flag,
                "symbol": symbol
            })
            
            update_count += 1
            
        # Commit the changes
        db.commit()
        
        logger.info(f"Successfully updated overamt values for {update_count} symbols")
        return True
        
    except Exception as e:
        logger.error(f"Error updating overamt values: {str(e)}")
        db.rollback()
        return False
    finally:
        db.close() 