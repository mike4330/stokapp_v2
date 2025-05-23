from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List
from pydantic import BaseModel
from datetime import date
import logging

from app.db.session import get_db
from app.db import crud
from app.utils.serializers import convert_to_dict

# Define transaction models
class TransactionCreate(BaseModel):
    date: date
    account: str
    symbol: str
    type: str
    units: float
    price: float

class TransactionUpdate(TransactionCreate):
    gain: float = None

class BulkCloseLotsRequest(BaseModel):
    lotIds: List[int]

# Create a router instance
router = APIRouter()

# Transaction CRUD routes
@router.get("/transactions")
def get_transactions(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    """Get recent transactions"""
    try:
        transactions = crud.get_transactions(db, skip=skip, limit=limit)
        return convert_to_dict(transactions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

@router.post("/transactions")
def create_transaction(transaction: TransactionCreate, db: Session = Depends(get_db)):
    """Create a new transaction"""
    try:
        # Convert Pydantic model to dictionary
        transaction_data = transaction.dict()
        
        # Create transaction
        new_transaction = crud.create_transaction(db, transaction_data)
        
        # Convert SQLAlchemy model to dictionary for response
        return convert_to_dict(new_transaction)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create transaction: {str(e)}")

@router.put("/transactions/{transaction_id}")
def update_transaction(transaction_id: int, transaction: TransactionUpdate, db: Session = Depends(get_db)):
    """Update an existing transaction"""
    try:
        # Convert Pydantic model to dictionary
        transaction_data = transaction.dict(exclude_unset=True)
        
        # Update transaction
        updated_transaction = crud.update_transaction(
            db, transaction_id, transaction_data
        )
        
        if not updated_transaction:
            
            raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} not found")
        
        # Convert SQLAlchemy model to dictionary for response
        return convert_to_dict(updated_transaction)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update transaction: {str(e)}")

@router.get("/transactions/symbol/{symbol}")
def get_symbol_transactions(symbol: str, db: Session = Depends(get_db)):
    """Get transactions for a specific symbol"""
    try:
        transactions = crud.get_transactions_by_symbol(db, symbol)
        return convert_to_dict(transactions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions for {symbol}: {str(e)}")

@router.get("/test")
def test_route():
    """Test endpoint to verify the router is working"""
    return {"message": "CRUD routes are working!"} 

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

@router.get("/symbols")
def get_all_symbols(db: Session = Depends(get_db)):
    """Get all symbols for local filtering"""
    try:
        query = text("SELECT DISTINCT symbol FROM prices ORDER BY symbol")
        result = db.execute(query)
        symbols = [row[0] for row in result]
        return symbols
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve symbols: {str(e)}")

@router.delete("/securities/{symbol}")
async def delete_security(symbol: str, db: Session = Depends(get_db)):
    """Delete a security from the system"""
    try:
        # Check if security has any positions
        check_positions = text("""
            SELECT 1 FROM security_values 
            WHERE symbol = :symbol AND shares > 0
            LIMIT 1
        """)
        
        has_positions = db.execute(check_positions, {"symbol": symbol}).fetchone()
        
        if has_positions:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot delete {symbol} - security has active positions"
            )
        
        # Begin transaction
        db.execute(text("BEGIN TRANSACTION"))
        
        # Delete from all related tables
        tables = ["prices", "sectors", "asset_classes", "MPT", "dividends"]
        
        for table in tables:
            delete_query = text(f"DELETE FROM {table} WHERE symbol = :symbol")
            db.execute(delete_query, {"symbol": symbol})
        
        # Commit the transaction
        db.execute(text("COMMIT"))
        
        return {"message": f"Security {symbol} deleted successfully"}
    
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Rollback in case of error
        db.execute(text("ROLLBACK"))
        logging.error(f"Error deleting security: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete security: {str(e)}")

@router.post("/close-lots")
def close_lots(body: dict, db: Session = Depends(get_db)):
    """Close multiple lots by updating transactions with disposition='sold'"""
    try:
        logging.info(f"Received request body: {body}")
        lot_ids = body.get('lotIds', [])
        if not lot_ids:
            logging.error("No lot IDs provided in request")
            raise HTTPException(status_code=400, detail="No lot IDs provided")

        logging.info(f"Attempting to close lots with IDs: {lot_ids}")
        # Begin transaction
        db.execute(text("BEGIN TRANSACTION"))
        
        # Update transactions to mark them as sold
        # Create placeholders for IN clause matching the number of IDs
        placeholders = ','.join([':id_' + str(i) for i in range(len(lot_ids))])
        update_query = text(f"""
            UPDATE transactions
            SET disposition = 'sold'
            WHERE id IN ({placeholders})
            AND (disposition IS NULL OR disposition != 'sold')
        """)
        # Create parameter dictionary for each ID
        params = {f'id_{i}': lot_id for i, lot_id in enumerate(lot_ids)}
        result = db.execute(update_query, params)
        
        logging.info(f"Update query executed, affected rows: {result.rowcount}")
        # Commit the transaction
        db.execute(text("COMMIT"))
        
        if result.rowcount == 0:
            logging.warning("No open lots found with the provided IDs or they are already closed")
            raise HTTPException(status_code=404, detail="No open lots found with the provided IDs or they are already closed")

        logging.info(f"Successfully closed {result.rowcount} lots")
        return {"message": f"Successfully closed {result.rowcount} lots"}
    except HTTPException as he:
        logging.error(f"HTTP Exception occurred: {str(he)}")
        raise
    except Exception as e:
        db.rollback()
        error_detail = str(e)
        logging.error(f"Unexpected error while closing lots: {error_detail}")
        raise HTTPException(status_code=500, detail=f"Failed to close lots: {error_detail}")
