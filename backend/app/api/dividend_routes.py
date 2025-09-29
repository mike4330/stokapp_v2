from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta, date

from app.db.session import get_db
from ..services.dividend_analysis import DividendAnalysisService

router = APIRouter()

# Define the maximum prediction date
MAX_PREDICTION_DATE = datetime(2038, 11, 1)

@router.get("/dividends/history/{symbol}")
async def get_symbol_dividend_history(
    symbol: str,
    db: Session = Depends(get_db)
):
    """
    Get historical dividend data for a specific stock symbol.
    """
    try:
        # Determine if this is a symbol that needs longer history
        symbols_with_longer_history = ['ANGL', 'ASML', 'FPE', 'GILD', 'KMB', 'LKOR', 'MLN', 'REM', 'VMC']
        period = 36 if symbol in symbols_with_longer_history else 24
        
        # Query based on the existing PHP code
        query = text(f"""
            SELECT substr(date_new, 0, 8) as month, symbol, SUM(price*units) as cost 
            FROM transactions 
            WHERE symbol = :symbol 
            AND date_new >= Date('now', '-{period} months')
            AND xtype = 'Div' 
            GROUP BY month 
            ORDER BY date_new
        """)
        
        result = db.execute(query, {"symbol": symbol}).fetchall()
        
        # Convert to list of dictionaries
        history = [{"date": row[0], "symbol": row[1], "cost": float(row[2])} for row in result]
        
        if not history:
            raise HTTPException(status_code=404, detail=f"No dividend history found for {symbol}")
            
        return history
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dividends/prediction/{symbol}")
async def get_symbol_prediction(
    symbol: str,
    is_monthly: Optional[bool] = Query(None, description="Whether the symbol pays monthly dividends"),
    db: Session = Depends(get_db)
):
    """
    Get dividend predictions for a specific stock symbol.
    """
    try:
        # If is_monthly is not provided, determine it automatically using analysis service
        if is_monthly is None:
            analysis_service = DividendAnalysisService(db)
            frequency_data = analysis_service.detect_payment_frequency(symbol)
            is_monthly = frequency_data["frequency"] == "monthly"
        
        # Get dividend history (still using the special list for longer history for now)
        symbols_with_longer_history = ['ANGL', 'ASML', 'FPE', 'GILD', 'KMB', 'LKOR', 'MLN', 'REM', 'VMC']
        period = 36 if symbol in symbols_with_longer_history else 24
        
        query = text(f"""
            SELECT substr(date_new, 0, 8) as month, symbol, SUM(price*units) as cost 
            FROM transactions 
            WHERE symbol = :symbol 
            AND date_new >= Date('now', '-{period} months')
            AND xtype = 'Div' 
            GROUP BY month 
            ORDER BY date_new
        """)
        
        result = db.execute(query, {"symbol": symbol}).fetchall()
        history = [{"date": row[0], "symbol": row[1], "cost": float(row[2])} for row in result]
        
        if not history:
            raise HTTPException(status_code=404, detail=f"No dividend history found for {symbol}")
        
        # Require at least 3 datapoints for reliable predictions
        if len(history) < 3:
            raise HTTPException(
                status_code=422, 
                detail=f"Insufficient data for {symbol} - need at least 3 datapoints, found {len(history)}"
            )
        
        # Calculate predictions using linear regression
        dividend_amounts = [entry["cost"] for entry in history]
        dividend_count = len(dividend_amounts)
        
        # Perform linear regression
        sum_x = sum(i + 1 for i in range(dividend_count))
        sum_y = sum(dividend_amounts)
        sum_xy = sum((i + 1) * y for i, y in enumerate(dividend_amounts))
        sum_xx = sum((i + 1) ** 2 for i in range(dividend_count))
        
        average_x = sum_x / dividend_count
        average_y = sum_y / dividend_count
        
        slope = (sum_xy - (dividend_count * average_x * average_y)) / (sum_xx - (dividend_count * average_x * average_x))
        intercept = average_y - (slope * average_x)
        
        # Calculate forecast dates
        last_data_date = history[-1]["date"]
        interval = 1 if is_monthly else 3  # Monthly or quarterly
        
        # Parse the date (assuming YYYY-MM format)
        try:
            year, month = map(int, last_data_date.split('-'))
            last_date = datetime(year, month, 1)
        except ValueError:
            # Fallback if date parsing fails
            last_date = datetime.now().replace(day=1)
        
        # Generate forecasts up to MAX_PREDICTION_DATE
        forecast = []
        has_negative_trend = False
        i = 0
        while True:
            # Calculate next date
            next_date = last_date + timedelta(days=interval * 30 * (i + 1))
            
            # Stop if we've reached the max prediction date
            if next_date > MAX_PREDICTION_DATE:
                break
                
            forecast_month = next_date.strftime("%Y-%m")
            
            # Calculate predicted cost (before clamping)
            predicted_cost_raw = intercept + (slope * (dividend_count + i * interval))
            
            # Check if trend is going negative
            if predicted_cost_raw < 0:
                has_negative_trend = True
                break  # Stop generating predictions if trend goes negative
            
            predicted_cost = predicted_cost_raw
                
            forecast.append({
                "date": forecast_month,
                "symbol": symbol,
                "cost": round(predicted_cost, 2)
            })
            
            i += 1
        
        # If the trend is negative, raise an exception to exclude this symbol
        if has_negative_trend:
            raise HTTPException(status_code=404, detail=f"Negative dividend trend detected for {symbol}")
        
        # Get last three entries
        last_three = forecast[-3:] if len(forecast) >= 3 else forecast
        
        return {
            "symbol": symbol,
            "is_monthly": is_monthly,
            "last_three": last_three,
            "complete_forecast": forecast
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dividends/predictions")
async def get_all_dividend_predictions(
    db: Session = Depends(get_db)
):
    """
    Get dividend predictions for all currently held symbols with dividend history.
    """
    try:
        # Get all currently held symbols (replacing hardcoded ticker list)
        current_holdings_query = text("""
            SELECT 
                symbol,
                SUM(CASE
                    WHEN units_remaining IS NULL THEN units
                    ELSE units_remaining
                END) as net_units
            FROM transactions
            WHERE xtype = 'Buy'
            AND disposition IS NULL
            GROUP BY symbol
            HAVING net_units > 0
            ORDER BY symbol
        """)
        
        holdings_result = db.execute(current_holdings_query).fetchall()
        tickers = [row[0] for row in holdings_result]
        
        # Known monthly dividend payers
        monthlies = ['ANGL', 'EMB', 'FPE', 'JPIB', 'LKOR', 'FAGIX', 'FNBGX', 'PGHY', 'SJNK', 'VCSH', 'TDTF']
        
        # Symbols to exclude from predictions (yearly payers, insufficient history, etc.)
        excluded_symbols = ['DBB', 'PDBC']
        
        # Process all currently held tickers
        predictions = {}
        total_monthly = 0
        total_quarterly = 0
        
        for ticker in tickers:
            # Skip excluded symbols
            if ticker in excluded_symbols:
                continue
                
            # Use automatic frequency detection, with hardcoded list as fallback
            if ticker in monthlies:
                is_monthly = True
            else:
                # Use automatic detection for symbols not in hardcoded list
                analysis_service = DividendAnalysisService(db)
                frequency_data = analysis_service.detect_payment_frequency(ticker)
                is_monthly = frequency_data["frequency"] == "monthly"
            
            # Get prediction for this ticker (we'd ideally refactor this to avoid duplicate code)
            try:
                prediction = await get_symbol_prediction(ticker, is_monthly, db)
                predictions[ticker] = prediction
                
                # Update totals based on last prediction
                last_value = prediction["last_three"][-1]["cost"] if prediction["last_three"] else 0
                
                if is_monthly:
                    total_monthly += last_value
                else:
                    total_quarterly += last_value
            except HTTPException as e:
                # Skip symbols with no dividend data or negative trends
                if "Negative dividend trend" in str(e.detail):
                    continue  # Skip symbols with declining dividend trends
                else:
                    # Include symbols with no dividend data but show empty predictions
                    predictions[ticker] = {
                        "symbol": ticker,
                        "is_monthly": is_monthly,
                        "last_three": []
                    }
        
        # Calculate yearly total
        total_yearly = (total_monthly * 12) + (total_quarterly * 4)
        
        return {
            "predictions": predictions,
            "summary": {
                "total_monthly": round(total_monthly, 2),
                "total_quarterly": round(total_quarterly, 2),
                "total_yearly": round(total_yearly, 2),
                "total_yearly_formatted": f"{round(total_yearly, 2):,}"
            }
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dividends/frequency/{symbol}")
async def get_dividend_frequency(symbol: str, db: Session = Depends(get_db)):
    """
    Analyze dividend payment history for a symbol and determine its payment frequency.
    
    This endpoint analyzes historical dividend data to determine whether a stock pays
    dividends monthly or quarterly based on payment patterns.
    
    Args:
        symbol: The stock ticker symbol to analyze
        
    Returns:
        Details about the imputed payment frequency including confidence score
    """
    try:
        analysis_service = DividendAnalysisService(db)
        frequency_data = analysis_service.detect_payment_frequency(symbol)
        return frequency_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/dividends/calendar")
async def get_dividend_calendar(
    start_date: Optional[str] = Query(None, description="Start date in YYYY-MM-DD format"),
    end_date: Optional[str] = Query(None, description="End date in YYYY-MM-DD format"),
    db: Session = Depends(get_db)
):
    """
    Get a calendar of upcoming dividend payments.
    
    Args:
        start_date: Optional start date filter (YYYY-MM-DD)
        end_date: Optional end date filter (YYYY-MM-DD)
        
    Returns:
        List of upcoming dividend payments with additional security information
    """
    try:
        # Build the base query
        query = text("""
            WITH current_holdings AS (
                SELECT 
                    symbol,
                    SUM(CASE
                        WHEN units_remaining IS NULL THEN units
                        ELSE units_remaining
                    END) as net_units
                FROM transactions
                WHERE xtype = 'Buy'
                AND disposition IS NULL
                GROUP BY symbol
                HAVING net_units > 0
            )
            SELECT 
                d.symbol,
                d.declare_date as payment_date,
                d.amount,
                p.price as current_price,
                p.divyield,
                ch.net_units,
                (ch.net_units * d.amount) as expected_payment
            FROM dividends d
            LEFT JOIN prices p ON d.symbol = p.symbol
            LEFT JOIN current_holdings ch ON d.symbol = ch.symbol
            WHERE 1=1
        """)
        
        params = {}
        
        # Add date filters if provided
        if start_date:
            query = text(str(query) + " AND d.declare_date >= :start_date")
            params["start_date"] = start_date
            
        if end_date:
            query = text(str(query) + " AND d.declare_date <= :end_date")
            params["end_date"] = end_date
            
        # Add default date range if no dates provided (next 90 days)
        if not start_date and not end_date:
            query = text(str(query) + " AND d.declare_date >= date('now') AND d.declare_date <= date('now', '+90 days')")
            
        # Order by payment date
        query = text(str(query) + " ORDER BY d.declare_date ASC")
        
        result = db.execute(query, params).fetchall()
        
        # Format the response
        calendar = []
        for row in result:
            calendar.append({
                "symbol": row[0],
                "payment_date": row[1],
                "amount": float(row[2]) if row[2] is not None else None,
                "current_price": float(row[3]) if row[3] is not None else None,
                "dividend_yield": float(row[4]) if row[4] is not None else None,
                "net_units": float(row[5]) if row[5] is not None else None,
                "expected_payment": float(row[6]) if row[6] is not None else None
            })
            
        return calendar
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 