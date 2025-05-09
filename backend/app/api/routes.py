from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
from pydantic import BaseModel
from datetime import date, datetime, timedelta
import numpy as np
import logging
from sklearn.preprocessing import StandardScaler
import os
import pandas as pd
import time

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
from app.mpt_modeling import initiate_mpt_modeling, get_task_status
from fastapi import BackgroundTasks

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

router = APIRouter()

@router.get("/mpt", response_model=List[MPTData])
def get_mpt_data(db: Session = Depends(get_db)):
    """Get symbol and sector mapping from MPT table"""
    try:
        query = text("SELECT symbol, sector FROM MPT WHERE symbol IS NOT NULL AND sector IS NOT NULL")
        result = db.execute(query)
        mpt_data = [{"symbol": row[0], "sector": row[1]} for row in result]
        return mpt_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve MPT data: {str(e)}")

@router.get("/holdings", response_model=List[Holding])
def get_holdings(db: Session = Depends(get_db)):
    try:
        # Step 1: Get all symbols - directly matching the PHP approach
        symbol_query = text("SELECT DISTINCT symbol FROM prices ORDER BY symbol")
        symbols = [row[0] for row in db.execute(symbol_query)]
        
        holdings = []
        for symbol in symbols:
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
            result = db.execute(units_query, {"symbol": symbol}).fetchone()
            
            if not result or result[0] is None or result[0] <= 0:
                continue  # Skip if no units
                
            net_units = float(result[0])  # Convert to float
            total_cost = float(result[1]) if result[1] is not None else 0  # Convert to float
            
            # Step 3: Get price data - matching your PHP approach
            price_query = text("SELECT price FROM prices WHERE symbol = :symbol")
            price_result = db.execute(price_query, {"symbol": symbol}).fetchone()
            
            if not price_result:
                continue  # Skip if no price data
                
            current_price = float(price_result[0])  # Convert to float
            
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
                "unrealized_gain_percent": unrealized_gain_percent
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

@router.get("/symbols/search")
def search_symbols(q: str = "", db: Session = Depends(get_db)):
    """Search for symbols"""
    try:
        query = text("""
            SELECT DISTINCT symbol 
            FROM prices 
            WHERE UPPER(symbol) LIKE UPPER(:query)
            ORDER BY symbol
            LIMIT 10
        """)
        result = db.execute(query, {"query": f"%{q}%"})
        symbols = [row[0] for row in result]
        return symbols
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to search symbols: {str(e)}")

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

@router.get("/model-recommendations", response_model=List[ModelRecommendation])
def get_model_recommendations(db: Session = Depends(get_db)):
    try:
        logger = logging.getLogger(__name__)
        logger.info("Model recommendations API called")
        
        # Query the necessary data
        query = text("""
            SELECT prices.symbol, prices.price, MPT.sectorshort, overamt, prices.divyield,
                   fcf_ni_ratio, volat, RSI, mean50, mean200, div_growth_rate, pe, average_pe, (pe-average_pe) as PE_diff
            FROM prices, MPT, sectors
            WHERE prices.symbol = MPT.symbol AND sectors.symbol = MPT.symbol
        """)
        result = db.execute(query)
        data = result.fetchall()
        columns = result.keys()
        
        logger.info(f"Query returned {len(data)} rows")
        
        import pandas as pd
        df = pd.DataFrame(data, columns=columns)
        if df.empty:
            logger.warning("DataFrame is empty after query")
            return []
            
        # Debug dataframe contents
        logger.info(f"DataFrame columns: {df.columns.tolist()}")
        logger.info(f"DataFrame shape: {df.shape}")
        
        # Drop rows with any NaN values (matching reference implementation)
        original_count = len(df)
        df = df.dropna(how='any')
        dropped_count = original_count - len(df)
        logger.info(f"Dropped {dropped_count} rows with NaN values")
        
        # Fill any remaining NaN values with 0 (matching reference implementation)
        df = df.fillna(0)
        
        # Define features to use in calculation (in the same order as reference implementation)
        features = [
            "RSI",
            "PE_diff",
            "volat",
            "mean50",
            "mean200",
            "divyield", 
            "div_growth_rate",
            "fcf_ni_ratio",
        ]
        
        # Prepare features - calculate transformations before scaling (matching reference)
        df['mean50'] = (df['price'] - df['mean50']) / df['price']
        df['mean200'] = (df['price'] - df['mean200']) / df['price']
        
        # Use sklearn's StandardScaler to match reference implementation
        scaler = StandardScaler()
        data_for_scaling = df[features]
        scaler.fit(data_for_scaling)
        
        # Define weights (same as reference implementation)
        weights = {
            "RSI": 1.1,
            "PE_diff": 1.0,
            "volat": 0.8,
            "mean50": 0.85,
            "mean200": 1.2,
            "divyield": -1.3,
            "div_growth_rate": -0.7,
            "fcf_ni_ratio": -1.2,
        }
        
        # Calculate z-scores with components (similar to reference implementation)
        def calculate_z_score(row, scaler):
            # Create raw components dictionary
            raw_components = {
                "RSI": row["RSI"],
                "PE_diff": row["PE_diff"],
                "volat": row["volat"],
                "mean50": row["mean50"],
                "mean200": row["mean200"],
                "divyield": row["divyield"],
                "div_growth_rate": row["div_growth_rate"],
                "fcf_ni_ratio": row["fcf_ni_ratio"],
            }
            
            # Create DataFrame for scaling
            components_df = pd.DataFrame([raw_components])
            
            # Scale the components
            scaled_components = scaler.transform(components_df)
            
            # Convert to dictionary
            scaled_components_dict = dict(zip(raw_components.keys(), scaled_components[0]))
            
            # Apply weights
            weighted_components = {k: v * weights[k] for k, v in scaled_components_dict.items()}
            
            # Sum for final z-score
            z_score = sum(weighted_components.values())
            
            return z_score
        
        # Apply the z-score calculation to each row
        df['z_score'] = df.apply(lambda row: calculate_z_score(row, scaler), axis=1)
        logger.info("Calculated z-scores successfully")
        
        # Filter and sort (matching reference implementation)
        overweight_min_thresh = -6
        filtered_df = df[df['overamt'] < overweight_min_thresh]
        
        if filtered_df.empty:
            logger.warning("No symbols with overamt < -6, returning top 15 by z-score without filtering")
            top15 = df.nsmallest(15, 'z_score')
        else:
            top15 = filtered_df.nsmallest(15, 'z_score')
                
        logger.info(f"Top 15 recommendations found: {len(top15)} rows")
        
        # Return as list of dicts
        result = [
            {
                'symbol': row['symbol'],
                'sectorshort': row['sectorshort'],
                'z_score': float(row['z_score']),
                'overamt': float(row['overamt']) if not pd.isna(row['overamt']) else 0.0
            }
            for _, row in top15.iterrows()
        ]
        
        logger.info(f"Returning {len(result)} recommendations")
        return result
    except Exception as e:
        logger = logging.getLogger(__name__)
        logger.error(f"Error in model-recommendations: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

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

@router.get("/debug/historical-table")
async def debug_historical_table(db: Session = Depends(get_db)):
    """
    Debug endpoint to examine the historical table structure and data
    """
    try:
        # Get table schema
        schema_query = text("PRAGMA table_info(historical)")
        schema_result = db.execute(schema_query).fetchall()
        
        # Get sample data (first 5 rows)
        sample_query = text("SELECT * FROM historical LIMIT 5")
        sample_result = db.execute(sample_query).fetchall()
        
        # Convert to dictionaries
        schema = [
            {
                "cid": row[0],
                "name": row[1],
                "type": row[2],
                "notnull": row[3],
                "dflt_value": row[4],
                "pk": row[5]
            }
            for row in schema_result
        ]
        
        # Count records
        count_query = text("SELECT COUNT(*) FROM historical")
        total_count = db.execute(count_query).scalar()
        
        # Check flag values
        flag_query = text("SELECT DISTINCT flag FROM historical")
        flag_result = db.execute(flag_query).fetchall()
        flags = [row[0] for row in flag_result]
        
        # Count by flag
        counts_by_flag = {}
        for flag in flags:
            if flag:
                count = db.execute(
                    text("SELECT COUNT(*) FROM historical WHERE flag = :flag"),
                    {"flag": flag}
                ).scalar()
                counts_by_flag[flag] = count
        
        # Create sample data from first rows
        column_names = [col["name"] for col in schema]
        sample_data = []
        for row in sample_result:
            sample_row = {}
            for i, col_name in enumerate(column_names):
                if i < len(row):
                    sample_row[col_name] = row[i]
            sample_data.append(sample_row)
        
        # Check essential columns
        date_values_query = text("SELECT DISTINCT date FROM historical LIMIT 10")
        date_values = [row[0] for row in db.execute(date_values_query).fetchall()]
        
        value_cost_query = text("SELECT date, value, cost FROM historical WHERE value IS NOT NULL AND cost IS NOT NULL LIMIT 5")
        value_cost_samples = [
            {"date": row[0], "value": row[1], "cost": row[2]}
            for row in db.execute(value_cost_query).fetchall()
        ]
        
        return {
            "schema": schema,
            "total_records": total_count,
            "flags": flags,
            "counts_by_flag": counts_by_flag,
            "sample_data": sample_data,
            "date_samples": date_values,
            "value_cost_samples": value_cost_samples
        }
    except Exception as e:
        return {"error": str(e)}

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

@router.post("/run-mpt-modeling")
def run_mpt_modeling(params: Dict[str, Any], background_tasks: BackgroundTasks):
    """
    Initiate an MPT modeling task and return a task ID for polling status.
    """
    try:
        task_id = initiate_mpt_modeling(background_tasks, params)
        return {"task_id": task_id, "message": "MPT modeling task initiated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initiate MPT modeling task: {str(e)}")

@router.get("/task-status/{task_id}")
def check_task_status(task_id: str):
    """
    Check the status of an MPT modeling task by ID.
    """
    try:
        status_data = get_task_status(task_id)
        return status_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check task status: {str(e)}")

@router.get("/data-status")
def get_data_status(db: Session = Depends(get_db)):
    """Get the status of the price data file and the latest date in the dataset"""
    try:
        # Check if the file exists
        file_exists = os.path.exists('app/data/pricedataset.csv')
        
        # Get the latest date from the database if available
        latest_date = None
        if file_exists:
            try:
                # Check the latest date in the security_values table
                query = text("""
                    SELECT MAX(timestamp)
                    FROM security_values
                """)
                result = db.execute(query).fetchone()
                if result and result[0]:
                    latest_date = result[0].strftime('%Y-%m-%d')
                    
                # If not found in security_values, try reading from CSV directly    
                if not latest_date:
                    try:
                        df = pd.read_csv('app/data/pricedataset.csv')
                        if 'Date' in df.columns and not df.empty:
                            latest_date = pd.to_datetime(df['Date']).max().strftime('%Y-%m-%d')
                    except Exception as e:
                        logging.error(f"Error reading price dataset CSV: {str(e)}")
            except Exception as e:
                logging.error(f"Error querying database for latest date: {str(e)}")
        
        return {
            "available": file_exists,
            "latest_date": latest_date
        }
    except Exception as e:
        logging.error(f"Error in get_data_status: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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