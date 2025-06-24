from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import time

from app.db.session import get_db
from app.db.crud import get_historical_portfolio_data, get_historical_returns_data

router = APIRouter()

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