from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
from datetime import datetime, date
import logging

from app.db.session import get_db
from app.db import crud

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

router = APIRouter()

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

@router.get("/potential-lots", response_model=List[PotentialLot])
def get_potential_lots(
    response: Response,
    profit_threshold: float = 0.6,
    lot_value_threshold: float = 1.0,
    overweight_threshold: float = 15,
    db: Session = Depends(get_db)
):
    """Get potential lots for sale based on profit and overweight criteria"""
    # Prevent caching of this endpoint
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

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

@router.get("/excess-lots")
def get_excess_lots(db: Session = Depends(get_db)):
    """Get open lots for symbols with target_alloc = 0 in MPT table and P/L > -1%"""
    try:
        # First get current prices
        price_query = text("SELECT symbol, price FROM prices")
        price_result = db.execute(price_query)
        current_prices = {row[0]: row[1] for row in price_result}

        # Get symbols with target_alloc = 0
        zero_alloc_query = text("""
            SELECT DISTINCT symbol
            FROM MPT
            WHERE target_alloc = 0
        """)
        zero_alloc_result = db.execute(zero_alloc_query)
        zero_alloc_symbols = {row[0] for row in zero_alloc_result}

        # Get all open lots
        lots = crud.get_open_lots(db)
        today = datetime.now().date()

        excess_lots = []

        for lot in lots:
            # Filter: only symbols with target_alloc = 0
            if lot.symbol not in zero_alloc_symbols:
                continue

            # Calculate P/L percentage
            if lot.price is None or lot.symbol not in current_prices:
                continue

            units = float(lot.units_remaining or lot.units)
            current_price = current_prices.get(lot.symbol, 0)
            lot_basis = units * float(lot.price)
            current_value = units * current_price
            profit_loss = current_value - lot_basis
            pl_pct = (profit_loss / lot_basis * 100) if lot_basis > 0 else 0

            # Filter: P/L > -1%
            if pl_pct <= -1:
                continue

            # Calculate term
            term = "Short-term"
            if lot.date_new is not None and isinstance(lot.date_new, str):
                purchase_date = datetime.strptime(lot.date_new, '%Y-%m-%d').date()
                if (today - purchase_date).days > 365:
                    term = "Long-term"

            excess_lots.append({
                "id": lot.id,
                "acct": lot.acct,
                "symbol": lot.symbol,
                "date_new": lot.date_new,
                "units_remaining": units,
                "price": float(lot.price),
                "lot_basis": round(lot_basis, 2),
                "current_value": round(current_value, 2),
                "profit_loss": round(profit_loss, 2),
                "pl_pct": round(pl_pct, 2),
                "term": term
            })

        # Sort by P/L percentage descending
        excess_lots.sort(key=lambda x: x["pl_pct"], reverse=True)

        return excess_lots

    except Exception as e:
        logging.error(f"Error in get_excess_lots: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) 