from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from pydantic import BaseModel
import math

from app.db.session import get_db

class SecurityReturn(BaseModel):
    symbol: str
    return_percent: float
    return_dollars: float

class SectorReturn(BaseModel):
    sector: str
    return_percent: float
    return_dollars: float

class PortfolioMetrics(BaseModel):
    total_return_dollars: float
    total_return_percent: float
    ytd_return_percent: Optional[float]
    annualized_return_percent: Optional[float]
    volatility_1y: Optional[float]

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


@router.get("/portfolio/metrics", response_model=PortfolioMetrics)
def get_portfolio_metrics(db: Session = Depends(get_db)):
    """
    Compute portfolio-level performance metrics:
    - Total Return $ and % (unrealized + realized + dividends)
    - YTD Return % (portfolio value change since Jan 1 + YTD dividends)
    - Annualized Return % (simple annualized total return from first purchase)
    - Volatility 1Y (annualized std dev of daily returns from historical table)
    """
    try:
        # --- Total Return: aggregate across all current holdings ---
        holdings_query = text("""
            SELECT
                t.symbol,
                SUM(CASE WHEN t.units_remaining IS NULL THEN t.units ELSE t.units_remaining END) AS net_units,
                SUM(CASE WHEN t.units_remaining IS NULL THEN t.units * t.price ELSE t.units_remaining * t.price END) AS total_cost
            FROM transactions t
            WHERE t.xtype = 'Buy'
            AND t.disposition IS NULL
            GROUP BY t.symbol
            HAVING net_units > 0
        """)
        holdings = db.execute(holdings_query).fetchall()

        portfolio_cost = 0.0
        portfolio_unrealized = 0.0

        for symbol, net_units, total_cost in holdings:
            price_row = db.execute(
                text("SELECT price FROM prices WHERE symbol = :s"), {"s": symbol}
            ).fetchone()
            if not price_row or not total_cost:
                continue
            current_value = net_units * price_row[0]
            portfolio_unrealized += current_value - total_cost
            portfolio_cost += total_cost

        # Realized gains from all Sell transactions
        realized_row = db.execute(
            text("SELECT COALESCE(SUM(gain), 0) FROM transactions WHERE xtype = 'Sell'")
        ).fetchone()
        portfolio_realized = realized_row[0] if realized_row else 0.0

        # All dividends ever received
        dividends_row = db.execute(
            text("SELECT COALESCE(SUM(price), 0) FROM transactions WHERE xtype = 'Div'")
        ).fetchone()
        portfolio_dividends = dividends_row[0] if dividends_row else 0.0

        total_return_dollars = portfolio_unrealized + portfolio_realized + portfolio_dividends
        total_return_percent = (total_return_dollars / portfolio_cost * 100) if portfolio_cost > 0 else 0.0

        # --- YTD Return: portfolio value change Jan 1 to now + YTD dividends ---
        ytd_start_row = db.execute(text("""
            SELECT value FROM historical
            WHERE date >= date('now', 'start of year')
            ORDER BY date ASC
            LIMIT 1
        """)).fetchone()

        current_value_row = db.execute(text("""
            SELECT value FROM historical
            ORDER BY date DESC
            LIMIT 1
        """)).fetchone()

        ytd_return_percent = None
        if ytd_start_row and current_value_row and ytd_start_row[0] and ytd_start_row[0] > 0:
            ytd_dividends_row = db.execute(text("""
                SELECT COALESCE(SUM(price), 0) FROM transactions
                WHERE xtype = 'Div'
                AND date_new >= date('now', 'start of year')
            """)).fetchone()
            ytd_dividends = ytd_dividends_row[0] if ytd_dividends_row else 0.0
            ytd_start_value = ytd_start_row[0]
            current_port_value = current_value_row[0]
            ytd_return_percent = ((current_port_value - ytd_start_value + ytd_dividends) / ytd_start_value) * 100

        # --- Annualized Return: simple annualization of total return ---
        annualized_return_percent = None
        first_tx_row = db.execute(text("""
            SELECT MIN(date_new) FROM transactions WHERE xtype = 'Buy'
        """)).fetchone()
        if first_tx_row and first_tx_row[0] and portfolio_cost > 0:
            from datetime import date as date_type
            import datetime
            first_date_str = first_tx_row[0]
            # Parse date string (SQLite returns ISO format)
            if isinstance(first_date_str, str):
                first_date = datetime.date.fromisoformat(first_date_str[:10])
            else:
                first_date = first_date_str
            years_held = (datetime.date.today() - first_date).days / 365.25
            if years_held > 0:
                total_return_ratio = total_return_dollars / portfolio_cost
                # Compound annualized: (1 + total_return_ratio)^(1/years) - 1
                annualized_return_percent = ((1 + total_return_ratio) ** (1 / years_held) - 1) * 100

        # --- Volatility 1Y: annualized std dev of daily % returns from portfolio value ---
        volatility_1y = None
        daily_values = db.execute(text("""
            SELECT value FROM historical
            WHERE date > date('now', '-366 days')
            AND value IS NOT NULL AND value > 0
            ORDER BY date
        """)).fetchall()
        if daily_values and len(daily_values) > 1:
            values = [r[0] for r in daily_values]
            # Compute day-over-day percentage returns
            pct_returns = [
                (values[i] - values[i - 1]) / values[i - 1] * 100
                for i in range(1, len(values))
                if values[i - 1] > 0
            ]
            if len(pct_returns) > 1:
                mean = sum(pct_returns) / len(pct_returns)
                variance = sum((v - mean) ** 2 for v in pct_returns) / (len(pct_returns) - 1)
                daily_std = math.sqrt(variance)
                volatility_1y = daily_std * math.sqrt(252)

        return {
            "total_return_dollars": total_return_dollars,
            "total_return_percent": total_return_percent,
            "ytd_return_percent": ytd_return_percent,
            "annualized_return_percent": annualized_return_percent,
            "volatility_1y": volatility_1y,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute portfolio metrics: {str(e)}")