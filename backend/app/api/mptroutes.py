from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import logging
import pandas as pd
from sklearn.preprocessing import StandardScaler

from app.db.session import get_db
from app.schemas.mpt import ModelRecommendation, MPTData
from app.mpt_modeling import initiate_mpt_modeling, get_task_status

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