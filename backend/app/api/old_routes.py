from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import os
import pandas as pd

from app.db.session import get_db

router = APIRouter()

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