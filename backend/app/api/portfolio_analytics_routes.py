from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel

from app.db.session import get_db

class SecurityReturn(BaseModel):
    symbol: str
    return_percent: float
    return_dollars: float

class SectorReturn(BaseModel):
    sector: str
    return_percent: float
    return_dollars: float

router = APIRouter()

@router.get("/returns/by-security", response_model=List[SecurityReturn])
def get_returns_by_security(db: Session = Depends(get_db)):
    """Get return percent by security, sorted by return percent descending"""
    try:
        # Get all current holdings (symbols and net units)
        query = text("""
            SELECT 
                t.symbol,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units
                    ELSE t.units_remaining
                END) as net_units,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units * t.price
                    ELSE t.units_remaining * t.price
                END) as total_cost
            FROM transactions t
            WHERE t.xtype = 'Buy'
            AND t.disposition IS NULL
            GROUP BY t.symbol
            HAVING net_units > 0
        """)
        result = db.execute(query)
        returns = []
        for symbol, net_units, total_cost in result:
            # Get current price
            price_query = text("""
                SELECT price
                FROM prices
                WHERE symbol = :symbol
            """)
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            if not price_result:
                continue
            current_price = price_result[0]
            position_value = net_units * current_price
            # Calculate return percent and dollars
            if total_cost and total_cost > 0:
                unrealized_gain = position_value - total_cost
                return_percent = (unrealized_gain / total_cost) * 100
                return_dollars = unrealized_gain
            else:
                return_percent = 0.0
                return_dollars = 0.0
            returns.append({
                "symbol": symbol,
                "return_percent": return_percent,
                "return_dollars": return_dollars
            })
        # Sort by return_percent descending
        returns.sort(key=lambda x: x["return_percent"], reverse=True)
        return returns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve returns by security: {str(e)}")

@router.get("/returns/total-by-security", response_model=List[SecurityReturn])
def get_total_returns_by_security(db: Session = Depends(get_db)):
    """Get total return percent by security (unrealized + realized + dividends), sorted by return percent descending"""
    try:
        # Get all current holdings (symbols and net units)
        query = text("""
            SELECT 
                t.symbol,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units
                    ELSE t.units_remaining
                END) as net_units,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units * t.price
                    ELSE t.units_remaining * t.price
                END) as total_cost
            FROM transactions t
            WHERE t.xtype = 'Buy'
            AND t.disposition IS NULL
            GROUP BY t.symbol
            HAVING net_units > 0
        """)
        result = db.execute(query)
        returns = []
        for symbol, net_units, total_cost in result:
            # Get current price
            price_query = text("""
                SELECT price
                FROM prices
                WHERE symbol = :symbol
            """)
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            if not price_result:
                continue
            current_price = price_result[0]
            position_value = net_units * current_price
            
            # Calculate realized P/L from sell transactions
            realized_pl_query = text("""
                SELECT COALESCE(SUM(gain), 0) as total_realized_pl
                FROM transactions
                WHERE symbol = :symbol
                AND xtype = 'Sell'
            """)
            realized_pl_result = db.execute(realized_pl_query, {"symbol": symbol}).fetchone()
            realized_pl = realized_pl_result[0] if realized_pl_result else 0.0

            # Calculate total dividends received
            total_dividends_query = text("""
                SELECT COALESCE(SUM(price), 0) as total_dividends
                FROM transactions
                WHERE symbol = :symbol
                AND xtype = 'Div'
            """)
            total_dividends_result = db.execute(total_dividends_query, {"symbol": symbol}).fetchone()
            total_dividends = total_dividends_result[0] if total_dividends_result else 0.0
            
            # Calculate total return percent and dollars (unrealized + realized + dividends)
            if total_cost and total_cost > 0:
                unrealized_gain = position_value - total_cost
                total_return = unrealized_gain + realized_pl + total_dividends
                return_percent = (total_return / total_cost) * 100
                return_dollars = total_return
            else:
                return_percent = 0.0
                return_dollars = 0.0
            returns.append({
                "symbol": symbol,
                "return_percent": return_percent,
                "return_dollars": return_dollars
            })
        # Sort by return_percent descending
        returns.sort(key=lambda x: x["return_percent"], reverse=True)
        return returns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve total returns by security: {str(e)}")

@router.get("/returns/total-by-sector", response_model=List[SectorReturn])
def get_total_returns_by_sector(db: Session = Depends(get_db)):
    """Get total return by sector (unrealized + realized + dividends), sorted by return percent descending"""
    try:
        # Get all current holdings with their sectors, net units, and cost basis
        query = text("""
            SELECT 
                t.symbol,
                mpt.sector,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units
                    ELSE t.units_remaining
                END) as net_units,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units * t.price
                    ELSE t.units_remaining * t.price
                END) as total_cost
            FROM transactions t
            LEFT JOIN MPT mpt ON t.symbol = mpt.symbol
            WHERE t.xtype = 'Buy'
            AND t.disposition IS NULL
            GROUP BY t.symbol, mpt.sector
            HAVING net_units > 0
        """)
        result = db.execute(query)
        
        # Calculate returns for each security and group by sector
        sector_data = {}
        
        for symbol, sector, net_units, total_cost in result:
            # Get current price
            price_query = text("""
                SELECT price
                FROM prices
                WHERE symbol = :symbol
            """)
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            if not price_result:
                continue
            current_price = price_result[0]
            position_value = net_units * current_price
            
            # Calculate realized P/L from sell transactions
            realized_pl_query = text("""
                SELECT COALESCE(SUM(gain), 0) as total_realized_pl
                FROM transactions
                WHERE symbol = :symbol
                AND xtype = 'Sell'
            """)
            realized_pl_result = db.execute(realized_pl_query, {"symbol": symbol}).fetchone()
            realized_pl = realized_pl_result[0] if realized_pl_result else 0.0

            # Calculate total dividends received
            total_dividends_query = text("""
                SELECT COALESCE(SUM(price), 0) as total_dividends
                FROM transactions
                WHERE symbol = :symbol
                AND xtype = 'Div'
            """)
            total_dividends_result = db.execute(total_dividends_query, {"symbol": symbol}).fetchone()
            total_dividends = total_dividends_result[0] if total_dividends_result else 0.0
            
            # Calculate total return dollars (unrealized + realized + dividends)
            unrealized_gain = position_value - total_cost if total_cost and total_cost > 0 else 0.0
            total_return_dollars = unrealized_gain + realized_pl + total_dividends
            
            # Use sector name or "Unknown" if not available
            sector_name = sector if sector else "Unknown"
            
            # Initialize sector data if not exists
            if sector_name not in sector_data:
                sector_data[sector_name] = {
                    "total_return_dollars": 0.0,
                    "total_cost": 0.0
                }
            
            # Add to sector totals
            sector_data[sector_name]["total_return_dollars"] += total_return_dollars
            sector_data[sector_name]["total_cost"] += total_cost if total_cost else 0.0
        
        # Calculate sector return percentages and prepare response
        sector_returns = []
        for sector_name, data in sector_data.items():
            return_percent = (data["total_return_dollars"] / data["total_cost"] * 100) if data["total_cost"] > 0 else 0.0
            sector_returns.append({
                "sector": sector_name,
                "return_percent": return_percent,
                "return_dollars": data["total_return_dollars"]
            })
        
        # Sort by return_percent descending
        sector_returns.sort(key=lambda x: x["return_percent"], reverse=True)
        return sector_returns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve total returns by sector: {str(e)}") 