from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
from pydantic import BaseModel
from datetime import datetime
import logging

from app.db.session import get_db

class SecurityCreate(BaseModel):
    symbol: str
    asset_class: str
    sector: str
    industry: str
    price: float
    dividend_frequency: Optional[str] = None

router = APIRouter()

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