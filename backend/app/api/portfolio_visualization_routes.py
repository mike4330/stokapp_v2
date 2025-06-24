from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
import logging

from app.db.session import get_db
from app.schemas.visualization import SunburstResponse, SunburstData

router = APIRouter()

@router.get("/portfolio/sunburst", response_model=SunburstResponse)
def get_portfolio_sunburst(db: Session = Depends(get_db)):
    """Get portfolio data formatted for sunburst visualization"""
    try:
        # Use the query from tree2.sql but adapted to our needs
        query = text("""
            WITH LatestTimestamps AS (
                SELECT symbol, MAX(timestamp) AS max_timestamp
                FROM security_values
                GROUP BY symbol
            )
            SELECT 
                sv.symbol,
                mpt.sector,
                mpt.market_cap,
                mpt.industry,
                CAST(sv.close AS FLOAT) * CAST(sv.shares AS FLOAT) AS value
            FROM security_values sv
            INNER JOIN LatestTimestamps lt 
                ON sv.symbol = lt.symbol AND sv.timestamp = lt.max_timestamp
            INNER JOIN MPT mpt 
                ON sv.symbol = mpt.symbol
            WHERE sv.shares > 0
        """)
        
        result = db.execute(query)
        
        # Process the results
        sunburst_data = []
        total_value = 0.0
        
        for row in result:
            value = row.value if row.value is not None else 0.0
            total_value += value
            
            sunburst_data.append(SunburstData(
                symbol=row.symbol,
                sector=row.sector or "Unknown",
                industry=row.industry or "Unknown",
                market_cap=row.market_cap or "Unknown",
                value=value
            ))
        
        return SunburstResponse(
            data=sunburst_data,
            total_value=total_value
        )
        
    except Exception as e:
        logging.error(f"Error in sunburst visualization: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate sunburst visualization data: {str(e)}"
        )

@router.get("/positions/{symbol}/returns")
def get_symbol_returns(symbol: str, days: int = 365, db: Session = Depends(get_db)):
    """Get return data over time for a specific symbol"""
    try:
        query = text("""
            SELECT 
                timestamp,
                symbol,
                cost_basis,
                close * shares as value,
                close,
                cbps,
                ((((close * shares) + cum_divs + cum_real_gl) - cost_basis) / cost_basis) * 100 as return_pct
            FROM security_values 
            WHERE symbol = :symbol 
            AND timestamp > date('now', :days || ' days')
            ORDER BY timestamp
        """)
        
        results = db.execute(query, {"symbol": symbol, "days": -days}).fetchall()
        
        if not results:
            raise HTTPException(status_code=404, detail=f"No return data found for symbol {symbol}")
            
        return [{
            "date": row.timestamp,
            "symbol": row.symbol,
            "cost_basis": float(row.cost_basis) if row.cost_basis else None,
            "value": float(row.value) if row.value else None,
            "close": float(row.close) if row.close else None,
            "cost_basis_per_share": float(row.cbps) if row.cbps else None,
            "return_percent": float(row.return_pct) if row.return_pct else None
        } for row in results]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve return data: {str(e)}")

@router.get("/positions/{symbol}/market-value-history")
def get_market_value_history(symbol: str, db: Session = Depends(get_db)):
    """Get historical market value data for a position"""
    try:
        query = text("""
            SELECT 
                timestamp,
                CAST(close AS FLOAT) as close,
                CAST(shares AS FLOAT) as shares,
                CAST(close AS FLOAT) * CAST(shares AS FLOAT) as market_value
            FROM security_values
            WHERE symbol = :symbol
            ORDER BY timestamp ASC
        """)
        result = db.execute(query, {"symbol": symbol})
        data = [
            {
                "timestamp": row[0],
                "close": row[1],
                "shares": row[2],
                "market_value": row[3]
            }
            for row in result
        ]
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve market value history: {str(e)}")

@router.get("/charts/cumulative-dividends")
def get_cumulative_dividends(db: Session = Depends(get_db)):
    """Get the latest cumulative dividends by symbol from security_values."""
    query = text("""
        SELECT symbol, cum_divs
        FROM security_values
        WHERE (symbol, timestamp) IN (
            SELECT symbol, MAX(timestamp)
            FROM security_values
            GROUP BY symbol
        )
        AND cum_divs IS NOT NULL
        ORDER BY cum_divs DESC
    """)
    result = db.execute(query)
    return [{"symbol": row[0], "value": row[1]} for row in result]

@router.get("/charts/cumulative-realized-gains")
def get_cumulative_realized_gains(db: Session = Depends(get_db)):
    """Get the latest cumulative realized gains by symbol from security_values."""
    query = text("""
        SELECT symbol, cum_real_gl
        FROM security_values
        WHERE (symbol, timestamp) IN (
            SELECT symbol, MAX(timestamp)
            FROM security_values
            GROUP BY symbol
        )
        AND cum_real_gl IS NOT NULL
        ORDER BY cum_real_gl
    """)
    result = db.execute(query)
    return [{"symbol": row[0], "value": row[1]} for row in result]

@router.get("/charts/income-time-series")
def get_income_time_series(db: Session = Depends(get_db)):
    """Get monthly absolute income (dividends and realized gains) for the last 36 months."""
    try:
        query = text("""
            SELECT
              substr(date_new, 0, 8) AS m,
              SUM(CASE WHEN xtype = 'Sell' THEN gain ELSE 0 END) AS realized_gains,
              SUM(CASE WHEN xtype = 'Div' THEN units * price ELSE 0 END) AS dividends,
              SUM(CASE WHEN xtype = 'Sell' THEN gain WHEN xtype = 'Div' THEN units * price ELSE 0 END) AS total_income
            FROM transactions
            WHERE date_new >= date('now','-36 months')
            GROUP BY m
            ORDER BY m
        """)
        result = db.execute(query)
        return [{
            "date": row[0],
            "realized_gains": float(row[1]) if row[1] is not None else 0,
            "dividends": float(row[2]) if row[2] is not None else 0,
            "total_income": float(row[3]) if row[3] is not None else 0
        } for row in result]
    except Exception as e:
        logging.error(f"Error in income-time-series endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve income time series data: {str(e)}") 