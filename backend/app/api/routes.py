from fastapi import APIRouter, Depends, HTTPException, Query, status, Request, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from datetime import date, datetime, timedelta
import numpy as np
import logging
import os
import pandas as pd
import time
import requests
import json
import re

from app.db.session import get_db
from app.db import crud
from app.utils.serializers import convert_to_dict
from app.schemas.holding import Holding
from app.schemas.position import Position
from app.db.crud import (
    get_all_prices, get_price_by_symbol, get_transactions, 
    get_transactions_by_symbol, get_open_lots, get_security_values_by_symbol,
    get_mpt_data, get_mpt_by_symbol, get_historical_portfolio_data,
    get_historical_returns_data
)
from app.schemas.visualization import SunburstResponse, SunburstData
from app.db.sec_session import SECSessionLocal, get_sec_db
from app.models.sec_models import SECCompanyInfo, SECFilingData

class TransactionCreate(BaseModel):
    date: date
    account: str
    symbol: str
    type: str
    units: float
    price: float
    units_remaining: float = None

class TransactionUpdate(TransactionCreate):
    gain: float = None
    disposition: str = None

class ModelRecommendation(BaseModel):
    symbol: str
    sectorshort: str
    z_score: float
    overamt: float

class SecurityReturn(BaseModel):
    symbol: str
    return_percent: float

class PotentialLot(BaseModel):
    account: str
    symbol: str
    date: date
    units: float
    current_price: float
    current_value: float
    profit: float
    profit_pct: float
    is_long_term: bool
    target_diff: float

class MPTData(BaseModel):
    symbol: str
    sector: str

class HoldingCountResponse(BaseModel):
    sector: str
    large: int
    medium: int
    small: int
    total: int

class SectorMarketCapResponse(BaseModel):
    holdings: List[HoldingCountResponse]
    totals: Dict[str, int]

class SecurityCreate(BaseModel):
    symbol: str
    asset_class: str
    sector: str
    industry: str
    price: float
    dividend_frequency: Optional[str] = None

router = APIRouter()

@router.get("/holdings-by-sector-marketcap", response_model=SectorMarketCapResponse)
def get_holdings_by_sector_marketcap(db: Session = Depends(get_db)):
    """
    Get count of holdings grouped by sector and market cap
    """
    try:
        # Query to get holdings grouped by sector and market cap
        # Pull data from transactions and MPT tables instead of positions
        query = text("""
        WITH unique_symbols AS (
            SELECT DISTINCT symbol
            FROM transactions
            WHERE xtype = 'Buy'
            AND disposition IS NULL
            GROUP BY symbol
            HAVING SUM(CASE WHEN units_remaining IS NULL THEN units ELSE units_remaining END) > 0
        )
        SELECT 
            COALESCE(mpt.sector, 'Unknown') as sector,
            COALESCE(mpt.market_cap, 'Unknown') as market_cap,
            COUNT(*) as count
        FROM unique_symbols us
        JOIN MPT mpt ON us.symbol = mpt.symbol
        WHERE COALESCE(mpt.sector, 'Unknown') != 'Bonds'
        GROUP BY sector, market_cap
        ORDER BY sector, market_cap
        """)
        
        results = db.execute(query).fetchall()
        
        # Process results into expected format
        sectors = {}
        totals = {'large': 0, 'medium': 0, 'small': 0, 'total': 0}
        
        for row in results:
            sector = row[0]
            raw_market_cap = row[1].lower() if row[1] else 'unknown'  # Ensure lowercase for consistency
            count = row[2]
            
            # Map market cap classifications:
            # - 'mega' -> 'large'
            # - 'micro' -> 'small'
            market_cap = raw_market_cap
            if raw_market_cap == 'mega':
                market_cap = 'large'
            elif raw_market_cap == 'micro':
                market_cap = 'small'
                
            # Skip if market_cap not in expected categories
            if market_cap not in ('large', 'medium', 'small'):
                continue
                
            if sector not in sectors:
                sectors[sector] = {'sector': sector, 'large': 0, 'medium': 0, 'small': 0, 'total': 0}
            
            sectors[sector][market_cap] = sectors[sector].get(market_cap, 0) + count
            sectors[sector]['total'] += count
            totals[market_cap] += count
            totals['total'] += count
        
        # Convert dict to list
        holdings_list = list(sectors.values())
        
        # Sort by sector name
        holdings_list.sort(key=lambda x: x['sector'])
        
        return {
            'holdings': holdings_list,
            'totals': totals
        }
        
    except Exception as e:
        logging.error(f"Error fetching holdings by sector/marketcap: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/holdings", response_model=List[Holding])
def get_holdings(group_by_account: bool = False, db: Session = Depends(get_db)):
    try:
        # Step 1: Get all symbols - directly matching the PHP approach
        symbol_query = text("SELECT DISTINCT symbol FROM prices ORDER BY symbol")
        symbols = [row[0] for row in db.execute(symbol_query)]
        
        holdings = []
        for symbol in symbols:
            if group_by_account:
                # Step 2: Get net units for this symbol by account
                units_query = text("""
                    SELECT acct, 
                           SUM(CASE
                               WHEN units_remaining IS NULL THEN units
                               ELSE units_remaining
                           END) as net_units,
                           SUM(CASE
                               WHEN units_remaining IS NULL THEN units * price
                               ELSE units_remaining * price
                           END) as total_cost
                    FROM transactions
                    WHERE xtype = 'Buy'
                    AND symbol = :symbol
                    AND disposition IS NULL
                    GROUP BY acct
                """)
                print(f"Executing query for {symbol} with group_by_account=true: {units_query}")
                units_results = db.execute(units_query, {"symbol": symbol}).fetchall()
                
                if not units_results or all(result[1] is None or result[1] <= 0 for result in units_results):
                    continue  # Skip if no units
            else:
                # Step 2: Get net units for this symbol
                units_query = text("""
                    SELECT SUM(CASE
                        WHEN units_remaining IS NULL THEN units
                        ELSE units_remaining
                    END) as net_units,
                    SUM(CASE
                        WHEN units_remaining IS NULL THEN units * price
                        ELSE units_remaining * price
                    END) as total_cost
                    FROM transactions
                    WHERE xtype = 'Buy'
                    AND symbol = :symbol
                    AND disposition IS NULL
                """)
                print(f"Executing query for {symbol} with group_by_account=false: {units_query}")
                result = db.execute(units_query, {"symbol": symbol}).fetchone()
                
                if not result or result[0] is None or result[0] <= 0:
                    continue  # Skip if no units
                    
                units_results = [(None, result[0], result[1])]
            
            # Step 3: Get price data - matching your PHP approach
            price_query = text("SELECT price FROM prices WHERE symbol = :symbol")
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            
            if not price_result:
                continue  # Skip if no price data
                
            current_price = float(price_result[0])  # Convert to float
            
            for acct, net_units, total_cost in units_results:
                net_units = float(net_units) if net_units is not None else 0  # Convert to float
                total_cost = float(total_cost) if total_cost is not None else 0  # Convert to float
                
                if net_units <= 0:
                    continue
                
                # Step 4: Calculate position value
                position_value = net_units * current_price
                
                # Step 5: Get technical indicators
                indicators_query = text("SELECT mean50, mean200 FROM prices WHERE symbol = :symbol")
                indicators_result = db.execute(indicators_query, {"symbol": symbol}).fetchone()
                mean50 = float(indicators_result[0]) if indicators_result and indicators_result[0] is not None else None
                mean200 = float(indicators_result[1]) if indicators_result and indicators_result[1] is not None else None
                
                # Step 6: Get previous close for price change calculation
                prev_close_query = text("""
                    SELECT close
                    FROM security_values
                    WHERE symbol = :symbol
                    ORDER BY timestamp DESC
                    LIMIT 1
                """)
                prev_close_result = db.execute(prev_close_query, {"symbol": symbol}).fetchone()
                
                # Make sure to convert to float and handle None values
                if prev_close_result and prev_close_result[0] is not None:
                    last_close = float(prev_close_result[0])
                else:
                    last_close = current_price
                
                # Set price changes based on symbol and time conditions
                # Matching the PHP logic for specific symbols and time of day
                if symbol in ["ETHUSD", "BTCUSD", "XAG"]:
                    # For these specific symbols, set changes to 0 as in the PHP code
                    price_change = 0
                    price_change_pct = 0
                else:
                    # For regular stocks, calculate normally
                    price_change = current_price - last_close
                    price_change_pct = (price_change / last_close) * 100 if last_close else 0
                    
                    # Set to 0 outside market hours if needed (similar to your PHP logic)
                    # You may need to adjust this based on your specific requirements
                    from datetime import datetime, time
                    import pytz
                    
                    est_tz = pytz.timezone('US/Eastern')
                    current_time = datetime.now(est_tz).time()
                    market_open = time(9, 30)  # 9:30 AM ET
                    market_close = time(16, 0)  # 4:00 PM ET
                    
                    # If outside market hours and it's a regular stock, set change to 0
                    if not (market_open <= current_time <= market_close):
                        price_change = 0
                        price_change_pct = 0
                
                # Step 7: Get MPT data (overamt)
                mpt_query = text("SELECT overamt FROM MPT WHERE symbol = :symbol")
                mpt_result = db.execute(mpt_query, {"symbol": symbol}).fetchone()
                overamt = float(mpt_result[0]) if mpt_result and mpt_result[0] is not None else None
                
                # Calculate unrealized gain/loss
                unrealized_gain = position_value - total_cost
                unrealized_gain_percent = (unrealized_gain / total_cost * 100) if total_cost > 0 else 0
                
                # Add to results
                holdings.append({
                    "symbol": symbol,
                    "units": net_units,
                    "current_price": current_price,
                    "position_value": position_value,
                    "ma50": mean50,
                    "ma200": mean200,
                    "overamt": overamt,
                    "price_change": price_change,
                    "price_change_pct": price_change_pct,
                    "unrealized_gain": unrealized_gain,
                    "unrealized_gain_percent": unrealized_gain_percent,
                    "acct": acct if acct else "Unknown"
                })
        
        return holdings
    except Exception as e:
        # Add more detailed error logging
        import traceback
        print(f"Error in get_holdings: {str(e)}")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/holdings/{symbol}")
def get_holding(symbol: str, db: Session = Depends(get_db)):
    """Get details for a specific holding"""
    try:
        # Get price data
        price = crud.get_price_by_symbol(db, symbol)
        if not price:
            raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
        
        # Get transactions for the symbol
        transactions = crud.get_transactions_by_symbol(db, symbol)
        
        # Get open lots
        open_lots = crud.get_open_lots(db, symbol)
        
        return {
            "price": convert_to_dict(price),
            "transactions": [convert_to_dict(t) for t in transactions],
            "open_lots": [dict(zip(lot.keys(), lot)) for lot in open_lots]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/open-lots")
def get_open_lots(db: Session = Depends(get_db)):
    """Get all open lots with profit/loss calculations"""
    try:
        # First get current prices
        price_query = text("SELECT symbol, price FROM prices")
        price_result = db.execute(price_query)
        current_prices = {row[0]: row[1] for row in price_result}
        
        lots = crud.get_open_lots(db)
        today = datetime.now().date()
        
        return [
            {
                "id": lot.id,
                "acct": lot.acct,
                "symbol": lot.symbol,
                "date_new": lot.date_new,
                "units": float(lot.units) if lot.units is not None else None,
                "units_remaining": float(lot.units_remaining) if lot.units_remaining is not None else None,
                "price": float(lot.price) if lot.price is not None else None,
                "term": "Long-term" if (
                    lot.date_new is not None and 
                    isinstance(lot.date_new, str) and 
                    (today - datetime.strptime(lot.date_new, '%Y-%m-%d').date()).days > 365
                ) else "Short-term",
                "lot_basis": round(float(lot.units_remaining or lot.units) * float(lot.price), 2) if lot.price is not None else None,
                "current_value": round(float(lot.units_remaining or lot.units) * current_prices.get(lot.symbol, 0), 2),
                "profit_loss": round(
                    (float(lot.units_remaining or lot.units) * current_prices.get(lot.symbol, 0)) - 
                    (float(lot.units_remaining or lot.units) * float(lot.price)),
                    2
                ) if lot.price is not None and lot.symbol in current_prices else None,
                "pl_pct": round(
                    ((float(lot.units_remaining or lot.units) * current_prices.get(lot.symbol, 0)) - 
                    (float(lot.units_remaining or lot.units) * float(lot.price))) /
                    (float(lot.units_remaining or lot.units) * float(lot.price)) * 100,
                    2
                ) if lot.price is not None and lot.symbol in current_prices else None
            }
            for lot in lots
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/transactions")
def get_transactions(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    """Get recent transactions"""
    try:
        transactions = crud.get_transactions(db, skip=skip, limit=limit)
        return convert_to_dict(transactions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

@router.get("/sector-allocation")
def get_sector_allocation(db: Session = Depends(get_db)):
    """Get sector allocation data for the portfolio"""
    try:
        # Get current holdings with their values
        holdings_query = text("""
            SELECT 
                t.symbol,
                SUM(CASE
                    WHEN t.units_remaining IS NULL THEN t.units
                    ELSE t.units_remaining
                END) as net_units
            FROM transactions t
            WHERE t.xtype = 'Buy'
            AND t.disposition IS NULL
            GROUP BY t.symbol
            HAVING net_units > 0
        """)
        holdings_result = db.execute(holdings_query)
        
        # Get current prices
        holdings = []
        for symbol, net_units in holdings_result:
            price_query = text("""
                SELECT price
                FROM prices
                WHERE symbol = :symbol
            """)
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            
            if price_result:
                current_price = price_result[0]
                position_value = net_units * current_price
                holdings.append({
                    "symbol": symbol,
                    "position_value": position_value
                })
        
        # Sector name normalization mapping
        sector_name_map = {
            "Health Care": "Healthcare"
            # Add more mappings as needed
        }
        
        # Get sector information and calculate sector totals
        sector_totals = {}
        total_portfolio_value = sum(h["position_value"] for h in holdings)
        
        for holding in holdings:
            sector_query = text("""
                SELECT sector
                FROM sectors
                WHERE symbol = :symbol
            """)
            sector_result = db.execute(sector_query, {"symbol": holding["symbol"]}).fetchone()
            
            if sector_result:
                original_sector = sector_result[0]
                # Normalize sector name
                sector = sector_name_map.get(original_sector, original_sector)
                
                if sector not in sector_totals:
                    sector_totals[sector] = 0
                sector_totals[sector] += holding["position_value"]
        
        # Format the response
        sector_data = [
            {
                "sector": sector,
                "value": value,
                "percentage": (value / total_portfolio_value) * 100
            }
            for sector, value in sector_totals.items()
        ]
        
        return {
            "sectors": sector_data,
            "total_value": total_portfolio_value
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/positions/{symbol}", response_model=Position)
def get_position(symbol: str, db: Session = Depends(get_db)):
    """Get detailed position information for a specific symbol"""
    try:
        # Get net units and cost basis
        units_query = text("""
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
            WHERE t.symbol = :symbol
            AND t.xtype = 'Buy'
            AND t.disposition IS NULL
            GROUP BY t.symbol
        """)
        units_result = db.execute(units_query, {"symbol": symbol}).fetchone()
        
        if not units_result:
            raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
            
        net_units = units_result[1] or 0
        total_cost = units_result[2] or 0
        
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
        
        # Get current price and moving averages
        price_query = text("""
            SELECT price, mean50, mean200
            FROM prices
            WHERE symbol = :symbol
        """)
        price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
        
        if not price_result:
            raise HTTPException(status_code=404, detail=f"Price data not found for {symbol}")
            
        current_price, ma50, ma200 = price_result
        position_value = net_units * current_price
        
        # Get sector information from MPT table
        sector_query = text("""
            SELECT sector
            FROM MPT
            WHERE symbol = :symbol
        """)
        sector_result = db.execute(sector_query, {"symbol": symbol}).fetchone()
        sector = sector_result[0] if sector_result else "Unknown"
        
        # Get dividend information from MPT table
        dividend_query = text("""
            SELECT divyield
            FROM MPT
            WHERE symbol = :symbol
        """)
        dividend_result = db.execute(dividend_query, {"symbol": symbol}).fetchone()
        dividend_yield = dividend_result[0] if dividend_result else 0.0
        
        # Calculate annual dividend based on position value and yield
        annual_dividend = (position_value * dividend_yield / 100) if dividend_yield else 0.0
        
        # Calculate unrealized gain/loss
        cost_basis = total_cost / net_units if net_units > 0 else 0
        unrealized_gain = position_value - total_cost
        unrealized_gain_percent = (unrealized_gain / total_cost * 100) if total_cost > 0 else 0
        
        # Get logo URL from local directory instead of Clearbit
        logo_url = f"/static/logos/{symbol}.png"
        
        return {
            "symbol": symbol,
            "units": net_units,
            "current_price": current_price,
            "position_value": position_value,
            "ma50": ma50,
            "ma200": ma200,
            "cost_basis": cost_basis,
            "unrealized_gain": unrealized_gain,
            "unrealized_gain_percent": unrealized_gain_percent,
            "sector": sector,
            "dividend_yield": dividend_yield,
            "annual_dividend": annual_dividend,
            "logo_url": logo_url,
            "realized_pl": realized_pl,
            "total_dividends": total_dividends
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve position data: {str(e)}")

@router.get("/positions/{symbol}/price-history")
def get_price_history(symbol: str, db: Session = Depends(get_db)):
    """Get price history data for a specific symbol"""
    try:
        # Get price history from security_values table
        query = text("""
            SELECT 
                timestamp as date,
                close as price
            FROM security_values
            WHERE symbol = :symbol
            ORDER BY timestamp DESC
            LIMIT 180  -- Last 6 months of data
        """)
        
        result = db.execute(query, {"symbol": symbol})
        
        price_history = []
        for row in result:
            price_history.append({
                "date": row[0],
                "price": float(row[1]) if row[1] is not None else None,
            })
        
        return price_history
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve price history: {str(e)}")

@router.get("/accounts")
def get_accounts():
    """Get list of all accounts"""
    return ["FID", "FIDRI", "TT"]

@router.post("/transactions")
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    """Create a new transaction"""
    try:
        # For new Buy transactions, units_remaining equals units
        units_remaining = transaction.units if transaction.type == 'Buy' else None
        # Convert date to string in YYYY-MM-DD format
        date_str = transaction.date.isoformat()
        # Execute the insert
        result = db.execute(
            text("""
                INSERT INTO transactions (
                    date_new,
                    symbol,
                    xtype,
                    acct,
                    price,
                    units,
                    units_remaining,
                    gain,
                    lotgain,
                    term,
                    disposition,
                    datetime,
                    fee,
                    note,
                    tradetype
                ) VALUES (
                    :date,
                    :symbol,
                    :type,
                    :account,
                    :price,
                    :units,
                    :units_remaining,
                    NULL,  -- gain
                    NULL,  -- lotgain
                    NULL,  -- term
                    NULL,  -- disposition
                    :datetime,
                    NULL,  -- fee
                    NULL,  -- note
                    NULL   -- tradetype
                )
                RETURNING id
            """),
            {
                "date": date_str,
                "symbol": transaction.symbol.upper(),
                "type": transaction.type,
                "account": transaction.account,
                "price": transaction.price,
                "units": transaction.units,
                "units_remaining": units_remaining,
                "datetime": date_str  # Using the same date for datetime field
            }
        )
        # Fetch the ID before committing
        new_id = result.scalar()
        # Commit the transaction
        db.commit()
        return {"id": new_id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/transactions/{transaction_id}")
def update_transaction(transaction_id: int, transaction: TransactionUpdate, db: Session = Depends(get_db)):
    """Update an existing transaction"""
    try:
        # Debug logging
        logger = logging.getLogger(__name__)
        logger.info(f"Updating transaction {transaction_id}")
        logger.info(f"Received data: {transaction.dict()}")
        
        # Check if transaction exists and get its current type and disposition
        query = text("""
            SELECT id, xtype, symbol, disposition FROM transactions
            WHERE id = :transaction_id
        """)
        result = db.execute(query, {"transaction_id": transaction_id}).fetchone()
        
        if not result:
            logger.error(f"Transaction {transaction_id} not found")
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")
        
        current_type = result[1]
        current_symbol = result[2]
        current_disposition = result[3]
        logger.info(f"Current transaction type: {current_type}, symbol: {current_symbol}, disposition: {current_disposition}")
        
        # Log disposition change if any
        new_disposition = transaction.disposition if hasattr(transaction, 'disposition') else None
        if new_disposition != current_disposition:
            logger.warning(f"DISPOSITION CHANGE - Transaction {transaction_id} ({current_symbol}): {current_disposition} -> {new_disposition}")
        
        # Determine if units_remaining should be updated
        # If units_remaining is provided in the payload, use it. Otherwise, use the legacy logic.
        units_remaining_update = ""
        params = {
            "transaction_id": transaction_id,
            "date": transaction.date,
            "account": transaction.account,  # API field
            "symbol": transaction.symbol,
            "type": transaction.type,  # API field
            "units": transaction.units,
            "price": transaction.price,
            "gain": transaction.gain if hasattr(transaction, 'gain') and transaction.gain is not None else None,
            "disposition": transaction.disposition if hasattr(transaction, 'disposition') and transaction.disposition is not None else None,
            "units_remaining": transaction.units_remaining if hasattr(transaction, 'units_remaining') else None
        }
        logger.info(f"Update parameters: {params}")
        
        if transaction.units_remaining is not None:
            units_remaining_update = ", units_remaining = :units_remaining"
        elif transaction.type == 'Buy':
            units_remaining_update = ", units_remaining = :units"
            params["units_remaining"] = transaction.units
        elif current_type == 'Buy' and transaction.type != 'Buy':
            units_remaining_update = ", units_remaining = NULL"
            params["units_remaining"] = None
        # else: don't update units_remaining
        
        # Update the transaction - Map API field names to DB column names
        update_query = text(f"""
            UPDATE transactions
            SET date_new = :date,
                acct = :account,      /* Map account (API) to acct (DB) */
                symbol = :symbol,
                xtype = :type,        /* Map type (API) to xtype (DB) */
                units = :units,
                price = :price,
                gain = :gain,
                disposition = :disposition
                {units_remaining_update}
            WHERE id = :transaction_id
        """)
        
        logger.info(f"Update query: {update_query}")
        
        db.execute(update_query, params)
        
        db.commit()
        logger.info(f"Transaction {transaction_id} updated successfully")
        return {"message": "Transaction updated successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update transaction: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update transaction: {str(e)}")

@router.get("/positions/{symbol}/transactions")
def get_symbol_transactions(symbol: str, db: Session = Depends(get_db)):
    """Get all transactions for a specific symbol"""
    try:
        query = text("""
            SELECT 
                id,
                date_new,
                xtype,
                acct,
                units,
                price,
                units_remaining,
                gain,
                disposition
            FROM transactions 
            WHERE symbol = :symbol
            ORDER BY date_new DESC, id DESC
        """)
        
        result = db.execute(query, {"symbol": symbol})
        transactions = []
        
        for row in result:
            transactions.append({
                "id": row[0],
                "date": row[1],
                "type": row[2],
                "account": row[3],
                "units": float(row[4]),
                "price": float(row[5]),
                "units_remaining": float(row[6]) if row[6] is not None else None,
                "gain": float(row[7]) if row[7] is not None else None,
                "disposition": row[8]
            })
            
        return transactions
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

@router.get("/portfolio/historical")
async def get_portfolio_history(db: Session = Depends(get_db)):
    """
    Get historical portfolio data for the portfolio performance chart
    """
    logger = logging.getLogger(__name__)
    logger.info("Portfolio history API called")
    
    try:
        history_data = get_historical_portfolio_data(db)
        
        logger.info(f"Retrieved {len(history_data)} records from database")
        
        # If we got data with any rows, log the first record for debugging
        if history_data and len(history_data) > 0:
            logger.info(f"First record: {history_data[0]}")
        
        return history_data
    except Exception as e:
        logger.exception(f"Error in portfolio history endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/portfolio/returns")
async def get_portfolio_returns(db: Session = Depends(get_db)):
    """
    Get historical returns data with moving averages
    """
    logger = logging.getLogger(__name__)
    logger.info("Portfolio returns API called")
    
    try:
        returns_data = get_historical_returns_data(db)
        
        logger.info(f"Retrieved {len(returns_data)} returns records from database")
        
        # If we got data with any rows, log the first record for debugging
        if returns_data and len(returns_data) > 0:
            logger.info(f"First returns record: {returns_data[0]}")
        
        return returns_data
    except Exception as e:
        logger.exception(f"Error in portfolio returns endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
            # Calculate return percent
            if total_cost and total_cost > 0:
                unrealized_gain = position_value - total_cost
                return_percent = (unrealized_gain / total_cost) * 100
            else:
                return_percent = 0.0
            returns.append({
                "symbol": symbol,
                "return_percent": return_percent
            })
        # Sort by return_percent descending
        returns.sort(key=lambda x: x["return_percent"], reverse=True)
        return returns
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve returns by security: {str(e)}")

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

@router.get("/potential-lots", response_model=List[PotentialLot])
def get_potential_lots(
    profit_threshold: float = 0.6,
    lot_value_threshold: float = 1.0,
    overweight_threshold: float = 8.6,
    db: Session = Depends(get_db)
):
    """Get potential lots for sale based on profit and overweight criteria"""
    try:
        # Get overweight positions from MPT
        overweight_query = text("""
            SELECT symbol, flag, overamt 
            FROM MPT 
            WHERE flag = 'O' AND overamt > :threshold
            ORDER BY overamt DESC
        """)
        overweight_positions = db.execute(overweight_query, {"threshold": overweight_threshold}).fetchall()
        
        potential_lots = []
        
        for position in overweight_positions:
            symbol = position.symbol
            target_diff = position.overamt
            
            # Skip if not overweight enough
            if target_diff < overweight_threshold:
                continue
                
            # Get current price
            price_query = text("SELECT price FROM prices WHERE symbol = :symbol")
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            if not price_result:
                continue
                
            current_price = float(price_result[0])
            
            # Get open lots
            lots_query = text("""
                SELECT acct, date_new, units, price, units_remaining
                FROM transactions 
                WHERE symbol = :symbol 
                AND xtype = 'Buy' 
                AND disposition IS NULL
            """)
            
            lots = db.execute(lots_query, {"symbol": symbol}).fetchall()
            
            for lot in lots:
                # Skip lots with no price
                if lot.price == 0:
                    continue
                    
                # Only consider profitable lots
                if lot.price >= current_price:
                    continue
                    
                units = float(lot.units_remaining if lot.units_remaining else lot.units)
                current_value = round(current_price * units, 2)
                cost = lot.price * units
                profit = round(current_value - cost, 2)
                profit_pct = round((profit / cost) * 100, 3)
                
                # Skip if doesn't meet thresholds
                if profit < profit_threshold or current_value < lot_value_threshold:
                    continue
                    
                # Calculate if long term
                try:
                    # Parse the date string from the database
                    if isinstance(lot.date_new, str):
                        purchase_date = datetime.strptime(lot.date_new, '%Y-%m-%d').date()
                    else:
                        purchase_date = lot.date_new
                        
                    is_long_term = (datetime.now().date() - purchase_date).days > 365
                except (ValueError, TypeError) as e:
                    logging.warning(f"Date parsing error for lot {lot}: {str(e)}")
                    is_long_term = False
                
                potential_lots.append({
                    "account": lot.acct,
                    "symbol": symbol,
                    "date": purchase_date,
                    "units": units,
                    "current_price": current_price,
                    "current_value": current_value,
                    "profit": profit,
                    "profit_pct": profit_pct,
                    "is_long_term": is_long_term,
                    "target_diff": target_diff
                })
        
        # Sort by profit percentage descending
        potential_lots.sort(key=lambda x: x["profit_pct"], reverse=True)
        
        return potential_lots
        
    except Exception as e:
        logging.error(f"Error in get_potential_lots: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weights")
def get_symbol_weights(symbols: str = Query(...), days: int = Query(365), db: Session = Depends(get_db)):
    """Get historical actual and target weights for multiple symbols."""
    try:
        import time
        start_time = time.time()
        
        # Parse the comma-separated list of symbols
        symbol_list = [s.strip() for s in symbols.split(',')]
        if not symbol_list:
            return {}
            
        parse_time = time.time()
        logging.info(f"Symbol parsing took: {(parse_time - start_time)*1000:.2f}ms")
            
        # Handle BRKB/BRK.B mapping
        symbol_mapping = {s: "BRK.B" if s == "BRKB" else s for s in symbol_list}
        
        # Create placeholders for the IN clause
        placeholders = ','.join([':symbol' + str(i) for i in range(len(symbol_list))])
        
        # Build the query for multiple symbols - optimized to do more filtering in SQL
        sql = text(f'''
            WITH filtered_data AS (
                SELECT 
                    sv.symbol,
                    sv.timestamp as date,
                    ((close*shares)/value) as weight,
                    w.weight as target
                FROM security_values sv
                JOIN historical h ON sv.timestamp = h.date
                LEFT JOIN weights w ON 
                    w.timestamp = sv.timestamp AND
                    w.symbol = CASE 
                        WHEN sv.symbol = 'BRKB' THEN 'BRK.B'
                        ELSE sv.symbol
                    END
                WHERE sv.symbol IN ({placeholders})
                AND sv.timestamp > date('now', :days_expr)
                AND w.weight > 0  -- Move target filter to SQL
                AND ((close*shares)/value) IS NOT NULL  -- Filter out null weights
            )
            SELECT 
                symbol,
                date,
                CAST(weight AS FLOAT) as weight,
                CAST(target AS FLOAT) as target
            FROM filtered_data
            ORDER BY symbol, date
        ''')
        
        query_build_time = time.time()
        logging.info(f"Query building took: {(query_build_time - parse_time)*1000:.2f}ms")
        
        days_expr = f'-{days} days'
        
        # Create parameter dictionary
        params = {f'symbol{i}': symbol for i, symbol in enumerate(symbol_list)}
        params['days_expr'] = days_expr
        
        # Log the query parameters for debugging
        logging.info(f"Executing weights query with {len(symbol_list)} symbols: {symbol_list}")
        
        # Execute with the parameters dictionary
        query_start = time.time()
        result = db.execute(sql, params)
        query_end = time.time()
        logging.info(f"Database query execution took: {(query_end - query_start)*1000:.2f}ms")
        
        # Organize data by symbol - simplified processing
        data_by_symbol = {}
        row_count = 0
        
        # Pre-allocate lists for each symbol
        for symbol in symbol_list:
            data_by_symbol[symbol] = []
            
        for row in result:
            row_count += 1
            symbol = row.symbol
            data_by_symbol[symbol].append({
                "date": row.date,
                "weight": row.weight,
                "target": row.target
            })
        
        process_time = time.time()
        logging.info(f"Processing {row_count} rows took: {(process_time - query_end)*1000:.2f}ms")
        logging.info(f"Total execution time: {(process_time - start_time)*1000:.2f}ms")
        logging.info(f"Returning data for {len(data_by_symbol)} symbols")
            
        return data_by_symbol
        
    except Exception as e:
        logging.error(f"Error in get_symbol_weights: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve weights: {str(e)}")

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

@router.get("/asset-classes")
def get_asset_classes(db: Session = Depends(get_db)):
    """Get list of unique asset classes"""
    try:
        query = text("""
            SELECT DISTINCT class 
            FROM asset_classes 
            WHERE class IS NOT NULL 
            ORDER BY class
        """)
        result = db.execute(query)
        asset_classes = [row[0] for row in result]
        return asset_classes
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve asset classes: {str(e)}")

@router.get("/securities")
def get_securities(db: Session = Depends(get_db)):
    """Get all securities from the prices table"""
    try:
        query = text("""
            SELECT 
                p.symbol,
                ac.class as asset_class,
                p.sector,
                p.industry,
                p.price,
                CASE
                    WHEN d.frequency = 'M' THEN 'monthly'
                    WHEN d.frequency = 'Q' THEN 'quarterly'
                    ELSE NULL
                END as dividend_frequency
            FROM prices p
            LEFT JOIN asset_classes ac ON p.symbol = ac.symbol
            LEFT JOIN (
                SELECT symbol, frequency
                FROM dividends
                GROUP BY symbol
            ) d ON p.symbol = d.symbol
            ORDER BY p.symbol
        """)
        result = db.execute(query)
        
        securities = []
        for row in result:
            securities.append({
                "symbol": row.symbol,
                "asset_class": row.asset_class,
                "sector": row.sector,
                "industry": row.industry,
                "price": float(row.price) if row.price is not None else 0.0,
                "dividend_frequency": row.dividend_frequency
            })
            
        return securities
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve securities: {str(e)}")

@router.post("/securities", status_code=201)
async def create_security(security: SecurityCreate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Add a new security to the system"""
    try:
        # Generate a task ID
        task_id = f"security_add_{security.symbol}_{int(datetime.now().timestamp())}"
        
        # Store the initial task state
        task_status = {
            "id": task_id,
            "status": "pending",
            "security": security.dict(),
            "steps": [
                {"name": "Add to prices table", "status": "pending"},
                {"name": "Add to sectors table", "status": "pending"},
                {"name": "Add to asset_classes table", "status": "pending"},
                {"name": "Add to MPT table", "status": "pending"}
            ],
            "current_step": 0,
            "message": "Security addition task initiated",
            "created_at": datetime.now().isoformat(),
            "completed_at": None
        }
        
        # Add dividend step if applicable
        if security.dividend_frequency:
            task_status["steps"].append({"name": "Add to dividends table", "status": "pending"})
        
        # Store task status (in a real implementation, this would go to Redis, a database, etc.)
        # For simplicity, we're using a global variable here
        if not hasattr(app, "tasks"):
            app.tasks = {}
        app.tasks[task_id] = task_status
        
        # Schedule the background task
        background_tasks.add_task(process_add_security_task, task_id, security, db)
        
        return {"task_id": task_id, "message": "Security addition task initiated"}
    
    except Exception as e:
        logging.error(f"Error initiating security addition task: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to initiate security addition: {str(e)}")

async def process_add_security_task(task_id: str, security: SecurityCreate, db: Session):
    """Process the security addition task in the background"""
    if not hasattr(app, "tasks"):
        app.tasks = {}
    
    task = app.tasks.get(task_id)
    if not task:
        logging.error(f"Task {task_id} not found")
        return
    
    try:
        # Begin transaction
        db.execute(text("BEGIN TRANSACTION"))
        
        # 1. Insert into prices table
        task["current_step"] = 0
        task["steps"][0]["status"] = "in_progress"
        
        insert_price = text("""
            INSERT INTO prices (symbol, asset_class, sector, industry, price)
            VALUES (:symbol, :asset_class, :sector, :industry, :price)
        """)
        
        db.execute(insert_price, {
            "symbol": security.symbol,
            "asset_class": security.asset_class,
            "sector": security.sector,
            "industry": security.industry,
            "price": security.price
        })
        
        task["steps"][0]["status"] = "completed"
        
        # 2. Insert into sectors table
        task["current_step"] = 1
        task["steps"][1]["status"] = "in_progress"
        
        insert_sector = text("""
            INSERT INTO sectors (symbol, sector, industry)
            VALUES (:symbol, :sector, :industry)
        """)
        
        db.execute(insert_sector, {
            "symbol": security.symbol,
            "sector": security.sector,
            "industry": security.industry
        })
        
        task["steps"][1]["status"] = "completed"
        
        # 3. Insert into asset_classes table
        task["current_step"] = 2
        task["steps"][2]["status"] = "in_progress"
        
        insert_asset_class = text("""
            INSERT INTO asset_classes (symbol, class)
            VALUES (:symbol, :class)
        """)
        
        db.execute(insert_asset_class, {
            "symbol": security.symbol,
            "class": security.asset_class
        })
        
        task["steps"][2]["status"] = "completed"
        
        # 4. Insert into MPT table with initial values
        task["current_step"] = 3
        task["steps"][3]["status"] = "in_progress"
        
        insert_mpt = text("""
            INSERT INTO MPT (symbol, sector)
            VALUES (:symbol, :sector)
        """)
        
        db.execute(insert_mpt, {
            "symbol": security.symbol,
            "sector": security.sector
        })
        
        task["steps"][3]["status"] = "completed"
        
        # 5. If dividend-paying, add to dividends table
        if security.dividend_frequency:
            task["current_step"] = 4
            task["steps"][4]["status"] = "in_progress"
            
            frequency = "M" if security.dividend_frequency == "monthly" else "Q"
            
            insert_dividend = text("""
                INSERT INTO dividends (symbol, frequency)
                VALUES (:symbol, :frequency)
            """)
            
            db.execute(insert_dividend, {
                "symbol": security.symbol,
                "frequency": frequency
            })
            
            task["steps"][4]["status"] = "completed"
        
        # Commit the transaction
        db.execute(text("COMMIT"))
        
        # Update task status
        task["status"] = "completed"
        task["message"] = f"Security {security.symbol} added successfully"
        task["completed_at"] = datetime.now().isoformat()
        
    except Exception as e:
        # Rollback in case of error
        db.execute(text("ROLLBACK"))
        
        # Update task status
        task["status"] = "failed"
        task["message"] = f"Failed to add security: {str(e)}"
        
        # Mark the current step as failed
        if task["current_step"] < len(task["steps"]):
            task["steps"][task["current_step"]]["status"] = "failed"
        
        logging.error(f"Error adding security: {str(e)}")

@router.get("/securities/tasks/{task_id}")
async def get_security_task_status(task_id: str):
    """Get the status of a security management task"""
    if not hasattr(app, "tasks"):
        app.tasks = {}
    
    task = app.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    return task

@router.get("/sec/10q/{cik}/all")
def get_all_10q(cik: str, db: Session = Depends(get_sec_db)):
    try:
        print(f"Starting fetch for all 10-Q filings for CIK: {cik}")
        # Ensure CIK is padded with leading zeros to 10 digits
        unpadded_cik = cik.lstrip('0')
        padded_cik = unpadded_cik.zfill(10)
        
        # Fetch all filings from SEC submissions API
        url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Making request to SEC API: {url}")
        response = requests.get(url, headers=headers)
        print(f"SEC API response status code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"SEC API error response: {response.text}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch from SEC API. Status: {response.status_code}, Response: {response.text}")

        try:
            data = response.json()
            print(f"Successfully parsed JSON response")
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON response: {str(e)}")
            print(f"Response content: {response.text[:500]}...")
            raise HTTPException(status_code=500, detail=f"Invalid JSON response from SEC API: {str(e)}")

        # Extract all 10-Q filings from the response
        if 'filings' not in data or 'recent' not in data['filings']:
            print("No filings data found in response")
            raise HTTPException(status_code=404, detail="No filings data found in SEC API response")
        
        recent_filings = data['filings']['recent']
        form_entries = recent_filings.get('form', [])
        
        # Find all indices where the form type is '10-Q'
        ten_q_indices = []
        for i, form in enumerate(form_entries):
            if form == '10-Q':
                ten_q_indices.append(i)
        
        if not ten_q_indices:
            print("No 10-Q filings found in the response")
            raise HTTPException(status_code=404, detail="No 10-Q filing found")

        # Fetch XBRL data for detailed financial information
        xbrl_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded_cik}.json"
        print(f"Making request to SEC XBRL API: {xbrl_url}")
        xbrl_response = requests.get(xbrl_url, headers=headers)
        xbrl_data = None
        if xbrl_response.status_code == 200:
            xbrl_data = xbrl_response.json()
            print(f"Successfully fetched XBRL data")
        else:
            print(f"Failed to fetch XBRL data: {xbrl_response.status_code}")
        
        # Get company information from XBRL data if available
        company_info = {
            'name': xbrl_data.get('entityName', 'Unknown') if xbrl_data else 'Unknown',
            'cik': xbrl_data.get('cik', unpadded_cik) if xbrl_data else unpadded_cik
        }
        
        # Process XBRL data to organize by filing if available
        filings_data = {}
        if xbrl_data and 'facts' in xbrl_data and 'us-gaap' in xbrl_data['facts']:
            key_concepts = [
                "Assets", "Liabilities", "StockholdersEquity", "NetIncomeLoss",
                "EarningsPerShareBasic", "EarningsPerShareDiluted",
                "CashAndCashEquivalentsAtCarryingValue",
                "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue",
                "OperatingIncomeLoss", "CostOfRevenue", "CostOfGoodsAndServicesSold",
                "CostOfGoodsSold", "GrossProfit"
            ]
            for concept in key_concepts:
                if concept not in xbrl_data['facts']['us-gaap']:
                    continue
                concept_data = xbrl_data['facts']['us-gaap'][concept]
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == '10-Q':
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accessionNumber': accn,
                                    'filingDate': filing.get('filed', ''),
                                    'reportDate': filing.get('end', ''),
                                    'fiscal_year': filing.get('fy', ''),
                                    'fiscal_period': filing.get('fp', ''),
                                    'company': company_info,
                                    'data': {}
                                }
                            if 'start' in filing:
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Extract data for all 10-Q filings and combine with XBRL data if available
        all_10q_filings = []
        stored_count = 0
        for idx in ten_q_indices:
            accession_number = recent_filings['accessionNumber'][idx]
            filing_metadata = {
                'form': recent_filings['form'][idx],
                'accessionNumber': accession_number,
                'filingDate': recent_filings['filingDate'][idx],
                'reportDate': recent_filings['reportDate'][idx],
                'primaryDocument': recent_filings['primaryDocument'][idx] if 'primaryDocument' in recent_filings else None,
                'primaryDocDescription': recent_filings['primaryDocDescription'][idx] if 'primaryDocDescription' in recent_filings else None,
                'document_url': f"https://www.sec.gov/Archives/edgar/data/{unpadded_cik}/{accession_number.replace('-', '')}/{recent_filings['primaryDocument'][idx]}" if 'primaryDocument' in recent_filings and recent_filings['primaryDocument'][idx] else None
            }
            
            # Combine metadata with XBRL data if available for this filing
            filing_data = filings_data.get(accession_number, filing_metadata)
            if accession_number in filings_data:
                filing_data.update(filing_metadata)
                filing_data['company'] = company_info
            else:
                filing_data = filing_metadata
            
            all_10q_filings.append(filing_data)
            
            # Check if filing already exists
            existing = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == filing_data['accessionNumber'],
                SECFilingData.data_type == '10-Q'
            ).first()
            
            current_time = datetime.utcnow()
            if existing:
                # Update existing record
                existing.data_json = json.dumps(filing_data)
                existing.updated_at = current_time
            else:
                # Create new record
                new_filing = SECFilingData(
                    cik=unpadded_cik,
                    accession_number=filing_data['accessionNumber'],
                    data_type='10-Q',
                    data_json=json.dumps(filing_data)
                )
                db.add(new_filing)
                stored_count += 1
        
        # Commit all new filings
        try:
            db.commit()
            print(f"Successfully stored or updated {stored_count} new 10-Q filings in database for CIK {unpadded_cik}")
        except Exception as db_error:
            print(f"Database error while storing 10-Q data: {str(db_error)}")
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to store 10-Q data: {str(db_error)}")

        return {
            "message": f"Retrieved {len(all_10q_filings)} 10-Q filings, stored or updated {stored_count} new filings", 
            "filings": all_10q_filings
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_10q: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@router.get("/sec/10q/{cik}/content/{accession_number}")
def get_filing_content(cik: str, accession_number: str, db: Session = Depends(get_sec_db)):
    try:
        print(f"Fetching content for 10-Q filing {accession_number} for CIK: {cik}")
        
        # Check if we have this filing in our database
        filing = db.query(SECFilingData).filter(
            SECFilingData.cik == cik,
            SECFilingData.accession_number == accession_number,
            SECFilingData.data_type == '10-Q'
        ).first()
        
        if not filing:
            # Fetch filing metadata if not in database
            # First, remove any existing padding to ensure we don't over-pad
            unpadded_cik = cik.lstrip('0')
            padded_cik = unpadded_cik.zfill(10)
            url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
            headers = {
                "User-Agent": "Private Research mike@roetto.org"
            }
            
            response = requests.get(url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Failed to fetch filing metadata from SEC API")
            
            data = response.json()
            recent_filings = data['filings']['recent']
            form_entries = recent_filings.get('form', [])
            accession_entries = recent_filings.get('accessionNumber', [])
            
            filing_index = None
            for i, acc_num in enumerate(accession_entries):
                if acc_num == accession_number and form_entries[i] == '10-Q':
                    filing_index = i
                    break
            
            if filing_index is None:
                raise HTTPException(status_code=404, detail=f"Filing with accession number {accession_number} not found")
            
            # Get primary document name
            primary_doc = recent_filings.get('primaryDocument', [])[filing_index] if 'primaryDocument' in recent_filings else None
            if not primary_doc:
                raise HTTPException(status_code=404, detail=f"Primary document not found for filing {accession_number}")
            
            # Format accession number to match SEC file structure (remove dashes)
            formatted_accession = accession_number.replace('-', '')
            
            # Build URL to fetch the HTML document content
            document_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{formatted_accession}/{primary_doc}"
        else:
            # Extract information from stored filing data
            filing_data = json.loads(filing.data_json)
            
            # Get primary document
            primary_doc = filing_data.get('primaryDocument')
            if not primary_doc:
                raise HTTPException(status_code=404, detail=f"Primary document not found for filing {accession_number}")
            
            # Format accession number to match SEC file structure (remove dashes)
            formatted_accession = accession_number.replace('-', '')
            
            # Build URL to fetch the HTML document content
            document_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{formatted_accession}/{primary_doc}"
        
        # Fetch the actual filing content
        print(f"Fetching document from: {document_url}")
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        content_response = requests.get(document_url, headers=headers)
        
        if content_response.status_code != 200:
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to fetch document content. Status: {content_response.status_code}"
            )
        
        # Return the document content and metadata
        return {
            "message": "Successfully retrieved filing content",
            "document_url": document_url,
            "content": content_response.text
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in get_filing_content: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@router.get("/sec/10q/{cik}/xbrl")
def get_10q_xbrl_data(cik: str, db: Session = Depends(get_sec_db)):
    """
    Fetch 10-Q filing data using the SEC XBRL API and store it in the database
    The XBRL API provides structured financial data in a machine-readable format.
    """
    try:
        print(f"Starting XBRL data fetch for CIK: {cik}")
        # Ensure CIK is padded with leading zeros to 10 digits
        unpadded_cik = cik.lstrip('0')
        padded_cik = unpadded_cik.zfill(10)
        
        # Fetch company facts from SEC XBRL API
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded_cik}.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Making request to SEC XBRL API: {url}")
        response = requests.get(url, headers=headers)
        
        if response.status_code != 200:
            return JSONResponse(
                status_code=response.status_code,
                content={"error": f"Failed to fetch data from SEC API. Status code: {response.status_code}"}
            )
        
        data = response.json()
        print(f"Successfully fetched XBRL data")
        
        # Filter out 10-K data and create a filtered version for storage
        filtered_data = {
            'cik': data.get('cik'),
            'entityName': data.get('entityName'),
            'facts': {
                'us-gaap': {}
            }
        }
        
        # Process and filter the data
        if 'facts' in data and 'us-gaap' in data['facts']:
            for concept, concept_data in data['facts']['us-gaap'].items():
                filtered_units = {}
                for unit_type, units in concept_data.get('units', {}).items():
                    # Filter to only include 10-Q filings
                    filtered_units[unit_type] = [
                        unit for unit in units 
                        if unit.get('form') == '10-Q'
                    ]
                    if filtered_units[unit_type]:  # Only add if we have 10-Q data
                        filtered_data['facts']['us-gaap'][concept] = {
                            'label': concept_data.get('label'),
                            'description': concept_data.get('description'),
                            'units': {unit_type: filtered_units[unit_type]}
                        }
        
        # Removed code for downloading and populating SEC-CompanyFacts data
        # The following block has been commented out to prevent storage of company facts data
        # try:
        #     # Check if we already have the complete facts
        #     existing_facts = db.query(SECFilingData).filter(
        #         SECFilingData.cik == unpadded_cik,
        #         SECFilingData.data_type == 'SEC-CompanyFacts'
        #     ).first()
        #     
        #     current_time = datetime.utcnow()
        #     
        #     if existing_facts:
        #         # Update the existing record
        #         existing_facts.data_json = json.dumps(filtered_data)
        #         existing_facts.updated_at = current_time
        #         db.commit()
        #         print(f"Updated filtered company facts for CIK {unpadded_cik}")
        #     else:
        #         # Store the filtered company facts
        #         facts_data = SECFilingData(
        #             cik=unpadded_cik,
        #             accession_number="all_facts",
        #             data_type='SEC-CompanyFacts',
        #             data_json=json.dumps(filtered_data)
        #         )
        #         db.add(facts_data)
        #         db.commit()
        #         print(f"Stored filtered company facts for CIK {unpadded_cik}")
        # except Exception as e:
        #     db.rollback()
        #     print(f"Error storing filtered company facts: {str(e)}")
        #     # Continue with the regular process even if this fails
        
        # Key financial concepts to extract
        key_concepts = [
            "Assets",
            "Liabilities", 
            "StockholdersEquity",
            "NetIncomeLoss",
            "EarningsPerShareBasic",
            "EarningsPerShareDiluted",
            "CashAndCashEquivalentsAtCarryingValue",
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenue",
            "OperatingIncomeLoss",
            "CostOfRevenue",
            "CostOfGoodsAndServicesSold",
            "CostOfGoodsSold",
            "GrossProfit"
        ]
        
        # Initialize data structure to store 10-Q data
        filings_data = {}
        
        # Get company information
        company_info = {
            'name': filtered_data.get('entityName', 'Unknown'),
            'cik': filtered_data.get('cik', 'Unknown')
        }
        
        # Extract key financial concepts from each 10-Q filing
        if 'facts' in filtered_data and 'us-gaap' in filtered_data['facts']:
            for concept in key_concepts:
                if concept not in filtered_data['facts']['us-gaap']:
                    print(f"Concept '{concept}' not found in data")
                    continue
                
                concept_data = filtered_data['facts']['us-gaap'][concept]
                
                # Process each unit (USD, USD/shares, etc.)
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        # Use accession number as unique identifier for the filing
                        accn = filing.get('accn')
                        if accn not in filings_data:
                            filings_data[accn] = {
                                'accession_number': accn,
                                'filing_date': filing.get('filed'),
                                'report_date': filing.get('end'),
                                'fiscal_year': filing.get('fy'),
                                'fiscal_period': filing.get('fp'),
                                'data': {}
                            }
                        
                        # Store the concept value
                        if 'start' in filing:
                            # This is a period value (like income)
                            filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                'value': filing.get('val'),
                                'start_date': filing.get('start'),
                                'end_date': filing.get('end'),
                                'unit': unit_type
                            }
                        else:
                            # This is a point-in-time value (like assets)
                            filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                'value': filing.get('val'),
                                'date': filing.get('end'),
                                'unit': unit_type
                            }
        
        # Convert to a list of filings
        filings_list = []
        for accn, filing_data in filings_data.items():
            filing_data['company'] = company_info
            filings_list.append(filing_data)
        
        # Sort by filing date (most recent first)
        filings_list.sort(key=lambda x: x.get('filing_date', ''), reverse=True)
        
        # Store individual filings in the database
        stored_count = 0
        updated_count = 0
        
        for filing in filings_list:
            try:
                # Check if filing already exists
                existing = db.query(SECFilingData).filter(
                    SECFilingData.cik == unpadded_cik,
                    SECFilingData.accession_number == filing['accession_number'],
                    SECFilingData.data_type == '10-Q-XBRL'
                ).first()
                
                if existing:
                    # Update existing filing
                    existing.data_json = json.dumps(filing)
                    existing.updated_at = current_time
                    updated_count += 1
                else:
                    # Store new filing
                    filing_data = SECFilingData(
                        cik=unpadded_cik,
                        accession_number=filing['accession_number'],
                        data_type='10-Q-XBRL',
                        data_json=json.dumps(filing)
                    )
                    db.add(filing_data)
                    stored_count += 1
            except Exception as e:
                print(f"Error storing filing {filing['accession_number']}: {str(e)}")
                continue
        
        try:
            db.commit()
            print(f"Successfully stored {stored_count} new filings and updated {updated_count} existing filings")
        except Exception as e:
            db.rollback()
            print(f"Database error while storing filings: {str(e)}")
        
        # Update company info table with the latest retrieval
        try:
            company = db.query(SECCompanyInfo).filter(SECCompanyInfo.cik == unpadded_cik).first()
            if company:
                company.updated_at = current_time
                db.commit()
        except Exception as e:
            print(f"Error updating company info timestamp: {str(e)}")
            db.rollback()
        
        return {
            "cik": cik,
            "company_name": company_info['name'],
            "total_filings": len(filings_list),
            "new_filings_stored": stored_count,
            "updated_filings": updated_count,
            "filings": filings_list
        }
        
    except Exception as e:
        print(f"Error processing XBRL data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to process XBRL data: {str(e)}"}
        )

@router.get("/sec/company-facts/{cik}")
def get_company_facts(cik: str, db: Session = Depends(get_sec_db)):
    """
    Retrieve the complete company facts data from the database
    This endpoint returns all available financial data for a company
    """
    try:
        # Normalize CIK
        unpadded_cik = cik.lstrip('0')
        
        # Retrieve the complete company facts
        facts = db.query(SECFilingData).filter(
            SECFilingData.cik == unpadded_cik,
            SECFilingData.data_type == 'SEC-CompanyFacts'
        ).first()
        
        if not facts:
            return JSONResponse(
                status_code=404,
                content={"error": "No company facts found for this CIK"}
            )
            
        return json.loads(facts.data_json)
        
    except Exception as e:
        print(f"Error retrieving company facts: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to retrieve company facts: {str(e)}"}
        )

@router.get("/sec/company-metrics/{cik}")
def get_company_metrics(cik: str, form_type: str = "10-Q", db: Session = Depends(get_sec_db)):
    """
    Extract specific metrics from company facts data for a particular form type
    This endpoint provides a compatibility layer that extracts metrics in the same
    format as the original filtered data approach
    """
    try:
        # Normalize CIK
        unpadded_cik = cik.lstrip('0')
        
        # Retrieve the complete company facts
        facts = db.query(SECFilingData).filter(
            SECFilingData.cik == unpadded_cik,
            SECFilingData.data_type == 'SEC-CompanyFacts'
        ).first()
        
        if not facts:
            return JSONResponse(
                status_code=404,
                content={"error": "No company facts found for this CIK"}
            )
            
        data = json.loads(facts.data_json)
        
        # Get company information
        company_info = {
            'name': data.get('entityName', 'Unknown'),
            'cik': data.get('cik', 'Unknown')
        }
        
        # Extract filings of the requested form type
        filings_data = {}
        
        if 'facts' in data and 'us-gaap' in data['facts']:
            # Process all concepts in the us-gaap taxonomy
            for concept, concept_data in data['facts']['us-gaap'].items():
                # Process each unit (USD, USD/shares, etc.)
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == form_type:
                            # Use accession number as unique identifier for the filing
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accession_number': accn,
                                    'filing_date': filing.get('filed'),
                                    'report_date': filing.get('end'),
                                    'fiscal_year': filing.get('fy'),
                                    'fiscal_period': filing.get('fp'),
                                    'data': {}
                                }
                            
                            # Store the concept value
                            if 'start' in filing:
                                # This is a period value (like income)
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                # This is a point-in-time value (like assets)
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Convert to a list of filings
        filings_list = []
        for accn, filing_data in filings_data.items():
            filing_data['company'] = company_info
            filings_list.append(filing_data)
        
        # Sort by filing date (most recent first)
        filings_list.sort(key=lambda x: x.get('filing_date', ''), reverse=True)
        
        if not filings_list:
            return JSONResponse(
                status_code=404,
                content={"error": f"No {form_type} filings found for this CIK"}
            )
        
        return {
            "cik": cik,
            "company_name": company_info['name'],
            "total_filings": len(filings_list),
            "filings": filings_list
        }
        
    except Exception as e:
        print(f"Error extracting metrics: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to extract metrics: {str(e)}"}
        )

@router.get("/sec/filing/{accession_number}")
def get_filing_by_accession(accession_number: str, db: Session = Depends(get_sec_db)):
    """
    Retrieve a specific SEC filing by its accession number.
    """
    try:
        # Simple query to get the filing data
        filing = db.query(SECFilingData).filter(
            SECFilingData.accession_number == accession_number
        ).first()
        
        if not filing:
            return JSONResponse(
                status_code=404,
                content={"error": f"Filing not found: {accession_number}"}
            )
        
        return json.loads(filing.data_json)
    except Exception as e:
        print(f"Error retrieving filing {accession_number}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to retrieve filing: {str(e)}"}
        )

@router.get("/sec/filing/{cik}")
def get_sec_filing_data(cik: str, accession_number: str = None, db: Session = Depends(get_sec_db)):
    """
    Get SEC filing data for a company. If accession_number is provided, returns data for that specific filing.
    Otherwise returns the most recent filing data.
    """
    try:
        # Normalize CIK - remove leading zeros and ensure it's a string
        unpadded_cik = str(int(cik))
        
        print(f"\nDebug - Filing request params:")
        print(f"CIK: {cik}")
        print(f"Unpadded CIK: {unpadded_cik}")
        print(f"Accession Number: {accession_number}")
        
        # If accession number is provided, try to get the specific filing
        if accession_number:
            # First try XBRL data
            query = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == accession_number,
                SECFilingData.data_type == '10-Q-XBRL'
            )
            print(f"\nDebug - SQL Query (XBRL):")
            print(str(query.statement.compile(compile_kwargs={"literal_binds": True})))
            
            filing = query.first()
            
            if filing:
                return json.loads(filing.data_json)
            
            # If no XBRL data, try regular 10-Q data
            query = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == accession_number,
                SECFilingData.data_type == '10-Q'
            )
            print(f"\nDebug - SQL Query (10-Q):")
            print(str(query.statement.compile(compile_kwargs={"literal_binds": True})))
            
            filing = query.first()
            
            if filing:
                return json.loads(filing.data_json)
            
            # If no filing found, try to fetch it from SEC API
            try:
                # Fetch filing metadata from SEC API
                padded_cik = unpadded_cik.zfill(10)
                url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
                headers = {
                    "User-Agent": "Private Research mike@roetto.org"
                }
                response = requests.get(url, headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    recent_filings = data['filings']['recent']
                    form_entries = recent_filings.get('form', [])
                    accession_entries = recent_filings.get('accessionNumber', [])
                    
                    filing_index = None
                    for i, acc_num in enumerate(accession_entries):
                        if acc_num == accession_number and form_entries[i] == '10-Q':
                            filing_index = i
                            break
                    
                    if filing_index is not None:
                        # Found the filing in SEC API, store it in our database
                        filing_data = {
                            'form': recent_filings['form'][filing_index],
                            'accessionNumber': recent_filings['accessionNumber'][filing_index],
                            'filingDate': recent_filings['filingDate'][filing_index],
                            'reportDate': recent_filings['reportDate'][filing_index],
                            'primaryDocument': recent_filings['primaryDocument'][filing_index] if 'primaryDocument' in recent_filings else None,
                            'primaryDocDescription': recent_filings['primaryDocDescription'][filing_index] if 'primaryDocDescription' in recent_filings else None
                        }
                        
                        # Store in database
                        new_filing = SECFilingData(
                            cik=unpadded_cik,
                            accession_number=accession_number,
                            data_type='10-Q',
                            data_json=json.dumps(filing_data)
                        )
                        db.add(new_filing)
                        db.commit()
                        
                        return filing_data
            except Exception as e:
                print(f"Error fetching filing from SEC API: {str(e)}")
            
            return JSONResponse(
                status_code=404,
                content={"error": f"No filing found with accession number {accession_number}"}
            )
        
        # Get the company facts data
        facts = db.query(SECFilingData).filter(
            SECFilingData.cik == unpadded_cik,
            SECFilingData.data_type == 'SEC-CompanyFacts'
        ).first()
        
        if not facts:
            # Try the old format
            facts = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == "all_facts"
            ).first()
            
            if not facts:
                return JSONResponse(
                    status_code=404,
                    content={"error": "No SEC data found for this CIK"}
                )
            
            # Update to new format
            facts.data_type = 'SEC-CompanyFacts'
            facts.accession_number = "company_facts"
            db.commit()
            
        data = json.loads(facts.data_json)
        
        # Get company information
        company_info = {
            'name': data.get('entityName', 'Unknown'),
            'cik': data.get('cik', 'Unknown')
        }
        
        # Extract filings data
        filings_data = {}
        
        if 'facts' in data and 'us-gaap' in data['facts']:
            # Process all concepts in the us-gaap taxonomy
            for concept, concept_data in data['facts']['us-gaap'].items():
                # Process each unit (USD, USD/shares, etc.)
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == '10-Q':
                            # Use accession number as unique identifier for the filing
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accession_number': accn,
                                    'filing_date': filing.get('filed'),
                                    'report_date': filing.get('end'),
                                    'fiscal_year': filing.get('fy'),
                                    'fiscal_period': filing.get('fp'),
                                    'data': {}
                                }
                            
                            # Store the concept value
                            if 'start' in filing:
                                # This is a period value (like income)
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                # This is a point-in-time value (like assets)
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Convert to a list of filings
        filings_list = []
        for accn, filing_data in filings_data.items():
            filing_data['company'] = company_info
            filings_list.append(filing_data)
        
        # Sort by filing date (most recent first)
        filings_list.sort(key=lambda x: x.get('filing_date', ''), reverse=True)
        
        if not filings_list:
            return JSONResponse(
                status_code=404,
                content={"error": "No 10-Q filings found for this CIK"}
            )
        
        return {
            "cik": cik,
            "company_name": company_info['name'],
            "total_filings": len(filings_list),
            "filings": filings_list
        }
        
    except Exception as e:
        print(f"Error retrieving SEC data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to retrieve SEC data: {str(e)}"}
        )

@router.get("/sec/update/{cik}")
def update_sec_data(cik: str, db: Session = Depends(get_sec_db)):
    """
    Fetch and update SEC filing data for a company, storing each 10-Q filing as a separate item keyed by accession number with detailed financial data.
    """
    try:
        print(f"Starting SEC data update for CIK: {cik}")
        # Ensure CIK is padded with leading zeros to 10 digits for API calls, but store unpadded in DB
        unpadded_cik = cik.lstrip('0')
        padded_cik = unpadded_cik.zfill(10)
        
        # Fetch all 10-Q filings from SEC submissions API
        url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Making request to SEC API: {url}")
        response = requests.get(url, headers=headers)
        
        if response.status_code != 200:
            return JSONResponse(
                status_code=response.status_code,
                content={"error": f"Failed to fetch data from SEC API. Status code: {response.status_code}"}
            )
        
        data = response.json()
        print(f"Successfully fetched SEC submissions data")
        
        # Extract all 10-Q filings
        if 'filings' not in data or 'recent' not in data['filings']:
            return JSONResponse(
                status_code=404,
                content={"error": "No filings data found in SEC API response"}
            )
        
        recent_filings = data['filings']['recent']
        form_entries = recent_filings.get('form', [])
        
        # Find all indices where form is '10-Q'
        ten_q_indices = [i for i, form in enumerate(form_entries) if form == '10-Q']
        
        if not ten_q_indices:
            return JSONResponse(
                status_code=404,
                content={"error": "No 10-Q filings found for this CIK"}
            )
        
        # Fetch XBRL data for detailed financial information
        xbrl_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded_cik}.json"
        print(f"Making request to SEC XBRL API: {xbrl_url}")
        xbrl_response = requests.get(xbrl_url, headers=headers)
        xbrl_data = None
        if xbrl_response.status_code == 200:
            xbrl_data = xbrl_response.json()
            print(f"Successfully fetched XBRL data")
        else:
            print(f"Failed to fetch XBRL data: {xbrl_response.status_code}")
        
        # Get company information from XBRL data if available
        company_info = {
            'name': xbrl_data.get('entityName', 'Unknown') if xbrl_data else 'Unknown',
            'cik': xbrl_data.get('cik', unpadded_cik) if xbrl_data else unpadded_cik
        }
        
        # Process XBRL data to organize by filing if available
        filings_data = {}
        if xbrl_data and 'facts' in xbrl_data and 'us-gaap' in xbrl_data['facts']:
            key_concepts = [
                "Assets", "Liabilities", "StockholdersEquity", "NetIncomeLoss",
                "EarningsPerShareBasic", "EarningsPerShareDiluted",
                "CashAndCashEquivalentsAtCarryingValue",
                "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue",
                "OperatingIncomeLoss", "CostOfRevenue", "CostOfGoodsAndServicesSold",
                "CostOfGoodsSold", "GrossProfit"
            ]
            for concept in key_concepts:
                if concept not in xbrl_data['facts']['us-gaap']:
                    continue
                concept_data = xbrl_data['facts']['us-gaap'][concept]
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == '10-Q':
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accessionNumber': accn,
                                    'filingDate': filing.get('filed', ''),
                                    'reportDate': filing.get('end', ''),
                                    'fiscal_year': filing.get('fy', ''),
                                    'fiscal_period': filing.get('fp', ''),
                                    'company': company_info,
                                    'data': {}
                                }
                            if 'start' in filing:
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Store each 10-Q filing individually with detailed data if available
        stored_count = 0
        for idx in ten_q_indices:
            accession_number = recent_filings['accessionNumber'][idx]
            filing_metadata = {
                'form': recent_filings['form'][idx],
                'accessionNumber': accession_number,
                'filingDate': recent_filings['filingDate'][idx],
                'reportDate': recent_filings['reportDate'][idx],
                'primaryDocument': recent_filings['primaryDocument'][idx] if 'primaryDocument' in recent_filings else None,
                'primaryDocDescription': recent_filings['primaryDocDescription'][idx] if 'primaryDocDescription' in recent_filings else None,
                'document_url': f"https://www.sec.gov/Archives/edgar/data/{unpadded_cik}/{accession_number.replace('-', '')}/{recent_filings['primaryDocument'][idx]}" if 'primaryDocument' in recent_filings and recent_filings['primaryDocument'][idx] else None
            }
            
            # Combine metadata with XBRL data if available for this filing
            filing_data = filings_data.get(accession_number, filing_metadata)
            if accession_number in filings_data:
                filing_data.update(filing_metadata)
                filing_data['company'] = company_info
            else:
                filing_data = filing_metadata
            
            # Check if filing already exists
            existing = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == filing_data['accessionNumber'],
                SECFilingData.data_type == '10-Q'
            ).first()
            
            current_time = datetime.utcnow()
            if existing:
                # Update existing record
                existing.data_json = json.dumps(filing_data)
                existing.updated_at = current_time
            else:
                # Create new record
                new_filing = SECFilingData(
                    cik=unpadded_cik,
                    accession_number=filing_data['accessionNumber'],
                    data_type='10-Q',
                    data_json=json.dumps(filing_data)
                )
                db.add(new_filing)
                stored_count += 1
        
        try:
            db.commit()
            print(f"Successfully stored or updated {stored_count} new 10-Q filings")
        except Exception as e:
            db.rollback()
            print(f"Database error while storing filings: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to store filings: {str(e)}"}
            )
        
        # Update company info timestamp
        try:
            company = db.query(SECCompanyInfo).filter(SECCompanyInfo.cik == unpadded_cik).first()
            if company:
                company.updated_at = datetime.utcnow()
                db.commit()
        except Exception as e:
            print(f"Error updating company info timestamp: {str(e)}")
            db.rollback()
        
        return {
            "message": f"Successfully updated SEC data, stored or updated {stored_count} new 10-Q filings",
            "total_filings": len(ten_q_indices)
        }
        
    except Exception as e:
        print(f"Error updating SEC data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to update SEC data: {str(e)}"}
        )

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
