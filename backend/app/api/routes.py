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

# Import the new route modules
from .portfolio_analytics_routes import router as portfolio_analytics_router
from .portfolio_visualization_routes import router as portfolio_visualization_router
from .lot_management_routes import router as lot_management_router
from .security_management_routes import router as security_management_router
from .portfolio_performance_routes import router as portfolio_performance_router

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

router = APIRouter()

# Include the new route modules
router.include_router(portfolio_analytics_router, tags=["portfolio-analytics"])
router.include_router(portfolio_visualization_router, tags=["portfolio-visualization"])
router.include_router(lot_management_router, tags=["lot-management"])
router.include_router(security_management_router, tags=["security-management"])
router.include_router(portfolio_performance_router, tags=["portfolio-performance"])

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
                units_results = db.execute(units_query, {"symbol": symbol}).fetchall()
                
                if not units_results or units_results[0][0] is None or units_results[0][0] <= 0:
                    continue  # Skip if no units
            
            # Step 3: Get current price
            price = crud.get_price_by_symbol(db, symbol)
            if not price:
                continue  # Skip if no price data
            
            # Step 4: Calculate market value and other fields
            if group_by_account:
                for result in units_results:
                    if result[1] and result[1] > 0:  # net_units > 0
                        net_units = float(result[1])
                        total_cost = float(result[2]) if result[2] else 0
                        current_price = float(price.price)
                        market_value = net_units * current_price
                        cost_basis = total_cost
                        gain_loss = market_value - cost_basis
                        gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis > 0 else 0
                        
                        holdings.append(Holding(
                            symbol=symbol,
                            acct=result[0],  # acct
                            units=net_units,
                            current_price=current_price,
                            position_value=market_value,
                            unrealized_gain=gain_loss,
                            unrealized_gain_percent=gain_loss_pct
                        ))
            else:
                net_units = float(units_results[0][0])
                total_cost = float(units_results[0][1]) if units_results[0][1] else 0
                current_price = float(price.price)
                market_value = net_units * current_price
                cost_basis = total_cost
                gain_loss = market_value - cost_basis
                gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis > 0 else 0
                
                holdings.append(Holding(
                    symbol=symbol,
                    acct=None,  # Not grouped by account
                    units=net_units,
                    current_price=current_price,
                    position_value=market_value,
                    unrealized_gain=gain_loss,
                    unrealized_gain_percent=gain_loss_pct
                ))
        
        return holdings
        
    except Exception as e:
        logging.error(f"Error in get_holdings: {str(e)}")
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

@router.get("/transactions")
def get_transactions(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    """Get all transactions with pagination"""
    try:
        transactions = crud.get_transactions(db, skip=skip, limit=limit)
        return [convert_to_dict(t) for t in transactions]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

@router.get("/sector-allocation")
def get_sector_allocation(db: Session = Depends(get_db)):
    """Get sector allocation data"""
    try:
        # Get all holdings
        holdings = get_holdings(db=db)
        
        # Group by sector
        sector_data = {}
        total_value = 0
        
        for holding in holdings:
            # Get sector info for this symbol
            sector_query = text("""
                SELECT sector FROM MPT WHERE symbol = :symbol
            """)
            result = db.execute(sector_query, {"symbol": holding.symbol}).fetchone()
            sector = result[0] if result else "Unknown"
            
            if sector not in sector_data:
                sector_data[sector] = {"sector": sector, "value": 0, "percentage": 0}
            
            sector_data[sector]["value"] += holding.position_value
            total_value += holding.position_value
        
        # Calculate percentages
        for sector in sector_data.values():
            sector["percentage"] = (sector["value"] / total_value * 100) if total_value > 0 else 0
        
        # Convert to list and sort by value descending
        sector_list = list(sector_data.values())
        sector_list.sort(key=lambda x: x["value"], reverse=True)
        
        return {
            "sectors": sector_list,
            "total_value": total_value
        }
        
    except Exception as e:
        logging.error(f"Error in get_sector_allocation: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/positions/{symbol}", response_model=Position)
def get_position(symbol: str, db: Session = Depends(get_db)):
    """Get detailed position information for a symbol"""
    try:
        # Get current price
        price = crud.get_price_by_symbol(db, symbol)
        if not price:
            raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found")
        
        # Calculate position metrics using the same logic as holdings endpoint
        # Get net units for this symbol (only non-disposed Buy transactions)
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
        units_result = db.execute(units_query, {"symbol": symbol}).fetchone()
        
        total_units = float(units_result[0]) if units_result and units_result[0] else 0
        total_cost = float(units_result[1]) if units_result and units_result[1] else 0
        
        # Calculate realized P/L from sell transactions
        realized_pl_query = text("""
            SELECT COALESCE(SUM(gain), 0) as total_realized_pl
            FROM transactions
            WHERE symbol = :symbol
            AND xtype = 'Sell'
        """)
        realized_pl_result = db.execute(realized_pl_query, {"symbol": symbol}).fetchone()
        realized_gain = realized_pl_result[0] if realized_pl_result else 0.0
        
        # Calculate current metrics
        current_price = float(price.price)
        market_value = total_units * current_price
        unrealized_gain = market_value - total_cost
        unrealized_gain_pct = (unrealized_gain / total_cost * 100) if total_cost > 0 else 0
        
        # Get sector info
        sector_query = text("SELECT sector FROM MPT WHERE symbol = :symbol")
        sector_result = db.execute(sector_query, {"symbol": symbol}).fetchone()
        sector = sector_result[0] if sector_result else "Unknown"
        
        # Get additional fields for Position model
        annual_dividend = 0.0  # Default to 0, could be enhanced later
        
        # Get moving averages from prices table
        ma_query = text("SELECT mean50, mean200, divyield FROM prices WHERE symbol = :symbol")
        ma_result = db.execute(ma_query, {"symbol": symbol}).fetchone()
        ma50 = ma_result[0] if ma_result else None
        ma200 = ma_result[1] if ma_result else None
        dividend_yield = ma_result[2] if ma_result and ma_result[2] else 0.0
        
        # Calculate total dividends received
        total_dividends_query = text("""
            SELECT COALESCE(SUM(price), 0) as total_dividends
            FROM transactions
            WHERE symbol = :symbol
            AND xtype = 'Div'
        """)
        total_dividends_result = db.execute(total_dividends_query, {"symbol": symbol}).fetchone()
        total_dividends = total_dividends_result[0] if total_dividends_result else 0.0
        
        return Position(
            symbol=symbol,
            units=total_units,
            current_price=current_price,
            position_value=market_value,
            ma50=ma50,
            ma200=ma200,
            cost_basis=total_cost,
            unrealized_gain=unrealized_gain,
            unrealized_gain_percent=unrealized_gain_pct,
            sector=sector,
            dividend_yield=dividend_yield,
            annual_dividend=annual_dividend,
            realized_pl=realized_gain,
            total_dividends=total_dividends
        )
        
    except Exception as e:
        logging.error(f"Error in get_position: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/positions/{symbol}/price-history")
def get_price_history(symbol: str, db: Session = Depends(get_db)):
    """Get price history for a symbol"""
    try:
        # Get security values for this symbol
        values = crud.get_security_values_by_symbol(db, symbol)
        
        # Format the data
        price_history = []
        for value in values:
            price_history.append({
                "date": value.timestamp,
                "price": float(value.close),
                "volume": value.volume,
                "shares": value.shares
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
