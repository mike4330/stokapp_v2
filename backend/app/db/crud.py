from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
import logging

from app.models.models import Price, Transaction, SecurityValue, MPT


# Price-related operations
def get_all_prices(db: Session) -> List[Price]:
    """Get all prices from the database"""
    return db.query(Price).all()

def get_price_by_symbol(db: Session, symbol: str) -> Optional[Price]:
    """Get price data for a specific symbol"""
    return db.query(Price).filter(Price.symbol == symbol).first()

# Historical portfolio data
def get_historical_portfolio_data(db: Session, limit: int = 365) -> List[dict]:
    """Get historical portfolio data for cost vs value chart"""
    logger = logging.getLogger(__name__)
    
    try:
        # Simple query focusing only on essential columns, similar to the PHP code
        query_str = """
            SELECT date, value, cost
            FROM historical 
            WHERE date > date('now', '-1 year')
            ORDER BY date
        """
        
        logger.info(f"Executing simplified query: {query_str}")
        query = text(query_str)
        
        # Execute query
        result = db.execute(query)
        
        # Manually convert rows to dictionaries by position
        data = []
        for row in result:
            # Create dict manually from tuple to handle various row formats
            data.append({
                "date": row[0],  # First column is date
                "value": row[1],  # Second column is value
                "cost": row[2]    # Third column is cost
            })
        
        logger.info(f"Simple query returned {len(data)} records")
        
        return data
        
    except Exception as e:
        logger.exception(f"Error retrieving historical portfolio data: {str(e)}")
        return []

# Get historical returns data with moving averages
def get_historical_returns_data(db: Session) -> List[dict]:
    """Get historical returns data with moving averages"""
    logger = logging.getLogger(__name__)
    
    try:
        # Query based on the PHP API
        query_str = """
            SELECT date, WMA24, YMA1, YMA2, YMA3, YMA4, return as rtn
            FROM historical 
            WHERE date > date('now', '-180 days')
            ORDER BY date
        """
        
        logger.info(f"Executing returns query: {query_str}")
        query = text(query_str)
        
        # Execute query
        result = db.execute(query)
        
        # Manually convert rows to dictionaries
        data = []
        for row in result:
            # The columns should be in order: date, WMA24, YMA1, YMA2, YMA3, YMA4, rtn
            data_row = {
                "date": row[0],
                "WMA24": row[1],
                "YMA1": row[2],
                "YMA2": row[3],
                "YMA3": row[4],
                "YMA4": row[5],
                "return": row[6]
            }
            data.append(data_row)
        
        logger.info(f"Returns query returned {len(data)} records")
        
        return data
        
    except Exception as e:
        logger.exception(f"Error retrieving historical returns data: {str(e)}")
        return []

# Transaction-related operations
def get_transactions(db: Session, skip: int = 0, limit: int = 100) -> List[Transaction]:
    """Get a list of transactions, with pagination"""
    return db.query(Transaction).order_by(Transaction.id.desc()).offset(skip).limit(limit).all()

def get_transactions_by_symbol(db: Session, symbol: str) -> List[Transaction]:
    """Get transactions for a specific symbol"""
    return db.query(Transaction).filter(Transaction.symbol == symbol).order_by(Transaction.date_new.desc()).all()

def get_open_lots(db: Session, symbol: Optional[str] = None):
    """Get open lots (using the view defined in your schema)"""
    if symbol:
        query = text(f"SELECT * FROM open_lots WHERE symbol = :symbol")
        result = db.execute(query, {"symbol": symbol})
    else:
        query = text("SELECT * FROM open_lots")
        result = db.execute(query)
    return result.fetchall()

# SecurityValue-related operations
def get_security_values_by_symbol(db: Session, symbol: str) -> List[SecurityValue]:
    """Get historical values for a specific symbol"""
    return db.query(SecurityValue).filter(SecurityValue.symbol == symbol).order_by(SecurityValue.timestamp.desc()).all()

# MPT-related operations
def get_mpt_data(db: Session) -> List[MPT]:
    """Get all MPT data"""
    return db.query(MPT).all()

def get_mpt_by_symbol(db: Session, symbol: str) -> Optional[MPT]:
    """Get MPT data for a specific symbol"""
    return db.query(MPT).filter(MPT.symbol == symbol).first()
