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
        i = 0
        while True:
            # Calculate next date
            next_date = last_date + timedelta(days=interval * 30 * (i + 1))
            
            # Stop if we've reached the max prediction date
            if next_date > MAX_PREDICTION_DATE:
                break
                
            forecast_month = next_date.strftime("%Y-%m")
            
            # Calculate predicted cost
            predicted_cost = intercept + (slope * (dividend_count + i * interval))
            if predicted_cost < 0:
                predicted_cost = 0
                
            forecast.append({
                "date": forecast_month,
                "symbol": symbol,
                "cost": round(predicted_cost, 2)
            })
            
            i += 1
        
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
    Get dividend predictions for all tracked symbols with summary statistics.
    """
    try:
        # Define your ticker lists (same as in the PHP code)
        tickers = [
            'AMX', 'ANGL', 'AVGO', 'BNDX', 'BRT', 'CARR', 'DGX', 'EMB',
            'EVC', 'FAF', 'FAGIX', 'FDGFX', 'FNBGX', 'FTS', 'HPK', 'HUN',
            'IMKTA', 'IPAR', 'JPIB', 'LKOR', 'NXST', 'PBR', 'PLD', 'PGHY',
            'SJNK', 'TDTF', 'TXNM', 'USLM', 'VALE', 'VCSH', 'WDFC'
        ]
        
        monthlies = ['ANGL', 'EMB', 'FPE', 'JPIB', 'LKOR', 'FAGIX', 'FNBGX', 'PGHY', 'SJNK', 'VCSH']
        
        # Process all tickers
        predictions = {}
        total_monthly = 0
        total_quarterly = 0
        
        for ticker in tickers:
            is_monthly = ticker in monthlies
            
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
            except HTTPException:
                # Skip tickers with no data
                continue
        
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