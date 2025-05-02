from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from datetime import date

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