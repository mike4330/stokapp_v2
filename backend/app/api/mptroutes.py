from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Dict, Any
import logging
import pandas as pd
from sklearn.preprocessing import StandardScaler

from app.db.session import get_db
from app.schemas.mpt import ModelRecommendation, ModelRecommendationsResponse, MPTData, MPTSymbol
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

@router.get("/mpt/symbols-with-allocation", response_model=List[MPTSymbol])
def get_symbols_with_allocation(db: Session = Depends(get_db)):
    """Get symbols with target_alloc > 0 from MPT table"""
    try:
        query = text("SELECT symbol, target_alloc FROM MPT WHERE target_alloc > 0 ORDER BY symbol")
        result = db.execute(query)
        symbols = [{"symbol": row[0], "target_alloc": row[1]} for row in result]
        return symbols
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve symbols with allocation: {str(e)}")

@router.get("/model-recommendations", response_model=ModelRecommendationsResponse)
def get_model_recommendations(response: Response, db: Session = Depends(get_db)):
    # Prevent caching of this endpoint
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

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
            return ModelRecommendationsResponse(recommendations=[], min_threshold=0.0, portfolio_value=0.0)
            
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
        
        # Calculate dynamic threshold as a percentage of total portfolio value
        portfolio_value_query = text("""
            SELECT SUM(net_units * p.price)
            FROM (
                SELECT t.symbol,
                       SUM(CASE WHEN units_remaining IS NULL THEN t.units ELSE units_remaining END) as net_units
                FROM transactions t
                WHERE t.xtype = 'Buy' AND t.disposition IS NULL
                GROUP BY t.symbol
                HAVING net_units > 0
            ) holdings
            JOIN prices p ON p.symbol = holdings.symbol
        """)
        portfolio_value = db.execute(portfolio_value_query).scalar() or 0.0
        threshold_pct = 0.0004
        overweight_min_thresh = -(portfolio_value * threshold_pct)
        logger.info(f"Portfolio value: {portfolio_value:.2f}, dynamic threshold: {overweight_min_thresh:.2f}")

        # Filter and sort (matching reference implementation)
        filtered_df = df[df['overamt'] < overweight_min_thresh]

        if filtered_df.empty:
            logger.warning(f"No symbols with overamt < {overweight_min_thresh:.2f}, returning top 15 by z-score without filtering")
            top15 = df.nsmallest(15, 'z_score')
        else:
            top15 = filtered_df.nsmallest(15, 'z_score')

        logger.info(f"Top 15 recommendations found: {len(top15)} rows")

        # Return as list of dicts
        recs = [
            ModelRecommendation(
                symbol=row['symbol'],
                sectorshort=row['sectorshort'],
                z_score=float(row['z_score']),
                overamt=float(row['overamt']) if not pd.isna(row['overamt']) else 0.0
            )
            for _, row in top15.iterrows()
        ]

        logger.info(f"Returning {len(recs)} recommendations")
        return ModelRecommendationsResponse(
            recommendations=recs,
            min_threshold=overweight_min_thresh,
            portfolio_value=float(portfolio_value),
        )
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

@router.get("/mpt-results/time-series")
def get_mpt_results_time_series(days: int = 365, db: Session = Depends(get_db)):
    """
    Get time series of MPT results (expected return, volatility, sharpe ratio) over time.

    Args:
        days: Number of days to look back (default 365)

    Returns:
        List of results with timestamp and metrics
    """
    try:
        from datetime import datetime, timedelta

        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        cutoff_str = cutoff_date.strftime('%Y-%m-%d %H:%M:%S')

        query = text("""
            SELECT
                timestamp,
                expected_return,
                volatility,
                sharpe_ratio
            FROM mpt_results
            WHERE timestamp >= :cutoff_date
            ORDER BY timestamp ASC
        """)

        result = db.execute(query, {"cutoff_date": cutoff_str})

        data = [
            {
                "timestamp": row[0],
                "expected_return": float(row[1]) if row[1] is not None else None,
                "volatility": float(row[2]) if row[2] is not None else None,
                "sharpe_ratio": float(row[3]) if row[3] is not None else None,
            }
            for row in result
        ]

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve MPT results time series: {str(e)}")

@router.get("/mpt-results/scatter")
def get_mpt_results_scatter(days: int = 365, db: Session = Depends(get_db)):
    """
    Get scatter plot data of expected_return vs lower_bound from MPT results.

    Args:
        days: Number of days to look back (default 365)

    Returns:
        List of results with expected_return and lower_bound
    """
    try:
        from datetime import datetime, timedelta

        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        cutoff_str = cutoff_date.strftime('%Y-%m-%d %H:%M:%S')

        query = text("""
            SELECT
                expected_return,
                lower_bound,
                timestamp
            FROM mpt_results
            WHERE timestamp >= :cutoff_date
            AND expected_return IS NOT NULL
            AND lower_bound IS NOT NULL
            ORDER BY timestamp ASC
        """)

        result = db.execute(query, {"cutoff_date": cutoff_str})

        data = [
            {
                "expected_return": float(row[0]),
                "lower_bound": float(row[1]),
                "timestamp": row[2],
            }
            for row in result
        ]

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve MPT results scatter data: {str(e)}")

@router.get("/mpt-results/gamma-scatter")
def get_mpt_results_gamma_scatter(days: int = 365, db: Session = Depends(get_db)):
    """
    Get scatter plot data of expected_return vs gamma from MPT results.

    Args:
        days: Number of days to look back (default 365)

    Returns:
        List of results with expected_return and gamma
    """
    try:
        from datetime import datetime, timedelta

        # Calculate cutoff date
        cutoff_date = datetime.now() - timedelta(days=days)
        cutoff_str = cutoff_date.strftime('%Y-%m-%d %H:%M:%S')

        query = text("""
            SELECT
                gamma,
                expected_return,
                timestamp
            FROM mpt_results
            WHERE timestamp >= :cutoff_date
            AND expected_return IS NOT NULL
            AND gamma IS NOT NULL
            ORDER BY timestamp ASC
        """)

        result = db.execute(query, {"cutoff_date": cutoff_str})

        data = [
            {
                "gamma": float(row[0]),
                "expected_return": float(row[1]),
                "timestamp": row[2],
            }
            for row in result
        ]

        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve MPT results gamma scatter data: {str(e)}")

@router.get("/mpt-results/validation")
def get_mpt_validation(
    horizon_days: int = 365,
    n_periods: int = 8,
    n_keystones: int = 3,
    keystone_min_dates: int = 15,
    db: Session = Depends(get_db),
):
    """Predicted vs realized return for past MPT runs.

    Selection is hybrid:
    - Up to `n_keystones` "keystone" rows are anchored to structural regimes
      (distinct upper_bound/lower_bound/max_volatility tuples) that contain
      at least `keystone_min_dates` validatable run dates. The representative
      date for each is the median validatable date within that regime.
    - The remaining slots (up to `n_periods` total) are time-evenly-spaced
      fills drawn from the candidate-date pool minus the keystones.

    Two realized flavors per row:
    - held_through_pct: only symbols still in `weights` at t1 (renormalized).
                        Cleanest read on model quality.
    - as_traded_pct:    every symbol in t0 weights. Sold symbols exit at last
                        observed price.

    The gap between the two reflects the relative performance of the sold
    cohort vs the held cohort, not pure trading alpha — sale proceeds aren't
    reinvested in this calc.
    """
    try:
        from datetime import date, timedelta

        today = date.today()
        cutoff = (today - timedelta(days=horizon_days)).isoformat()

        candidate_rows = db.execute(text("""
            SELECT DISTINCT date(m.timestamp) AS d
            FROM mpt_results m
            WHERE date(m.timestamp) <= :cutoff
              AND EXISTS (
                  SELECT 1 FROM weights w WHERE w.timestamp = date(m.timestamp)
              )
            ORDER BY d
        """), {"cutoff": cutoff}).fetchall()

        candidate_dates = [r[0] for r in candidate_rows]
        if not candidate_dates:
            return {"horizon_days": horizon_days, "rows": []}

        # Identify keystone regimes: structural (upper/lower/max_vol) groups
        # with at least keystone_min_dates eligible candidate dates. Take the
        # median candidate date per regime as that regime's representative.
        ph = ",".join(f":d{i}" for i in range(len(candidate_dates)))
        ph_params = {f"d{i}": candidate_dates[i] for i in range(len(candidate_dates))}

        keystone_rows = db.execute(text(f"""
            WITH eligible AS (
              SELECT DISTINCT date(timestamp) AS d,
                     upper_bound, lower_bound, max_volatility
              FROM mpt_results
              WHERE date(timestamp) IN ({ph})
            ),
            ranked AS (
              SELECT upper_bound, lower_bound, max_volatility, d,
                     COUNT(*) OVER (
                       PARTITION BY upper_bound, lower_bound, max_volatility
                     ) AS cnt,
                     ROW_NUMBER() OVER (
                       PARTITION BY upper_bound, lower_bound, max_volatility
                       ORDER BY d
                     ) AS rn
              FROM eligible
            )
            SELECT upper_bound, lower_bound, max_volatility, cnt, d
            FROM ranked
            WHERE rn = (cnt + 1) / 2 AND cnt >= :min_runs
            ORDER BY cnt DESC, d
            LIMIT :n_keystones
        """), {**ph_params, "min_runs": keystone_min_dates,
               "n_keystones": n_keystones}).fetchall()

        # Map keystone date -> regime metadata
        keystone_meta = {
            r[4]: {
                "is_keystone": True,
                "regime_run_count": int(r[3]),
                "regime_signature": (
                    f"u={r[0]:.4f} / l={r[1]:.4f} / vol={r[2]:.4f}"
                ),
            }
            for r in keystone_rows
        }
        keystone_dates = set(keystone_meta.keys())

        # Fill remaining slots with time-evenly-spaced dates from the
        # non-keystone pool. If nothing left, just use the keystones.
        fill_count = max(0, n_periods - len(keystone_dates))
        non_keystone = [d for d in candidate_dates if d not in keystone_dates]

        if fill_count == 0 or not non_keystone:
            fill_dates: list[str] = []
        elif len(non_keystone) <= fill_count:
            fill_dates = list(non_keystone)
        else:
            step = (len(non_keystone) - 1) / max(1, fill_count - 1) if fill_count > 1 else 0
            picks = (
                [non_keystone[round(i * step)] for i in range(fill_count)]
                if fill_count > 1
                else [non_keystone[len(non_keystone) // 2]]
            )
            seen: set = set()
            fill_dates = [d for d in picks if not (d in seen or seen.add(d))]

        selected = sorted(set(list(keystone_dates) + fill_dates))

        rows = []
        for t0 in selected:
            t1 = (date.fromisoformat(t0) + timedelta(days=horizon_days)).isoformat()

            agg = db.execute(text("""
                WITH basket AS (
                  SELECT w.symbol, w.weight,
                    (SELECT close FROM security_values
                       WHERE symbol = w.symbol AND timestamp <= :t0
                       ORDER BY timestamp DESC LIMIT 1) AS p0,
                    (SELECT MAX(timestamp) FROM security_values
                       WHERE symbol = w.symbol) AS last_seen
                  FROM weights w WHERE w.timestamp = :t0
                ),
                priced AS (
                  SELECT b.symbol, b.weight, b.p0,
                    (SELECT close FROM security_values
                       WHERE symbol = b.symbol
                         AND timestamp <= CASE
                             WHEN b.last_seen IS NULL THEN :t1
                             WHEN b.last_seen < :t1 THEN b.last_seen
                             ELSE :t1
                         END
                       ORDER BY timestamp DESC LIMIT 1) AS p_exit,
                    CASE WHEN b.last_seen IS NULL OR b.last_seen < :t1
                         THEN 'sold' ELSE 'held' END AS status
                  FROM basket b
                )
                SELECT
                  SUM(CASE WHEN status='held' THEN 1 ELSE 0 END) AS n_held,
                  SUM(CASE WHEN status='sold' THEN 1 ELSE 0 END) AS n_sold,
                  CASE
                    WHEN SUM(CASE WHEN status='held' AND p0 IS NOT NULL AND p_exit IS NOT NULL
                                  THEN weight END) IS NULL THEN NULL
                    ELSE
                      SUM(CASE WHEN status='held' AND p0 IS NOT NULL AND p_exit IS NOT NULL
                               THEN weight * (p_exit*1.0/p0 - 1) END)
                      / SUM(CASE WHEN status='held' AND p0 IS NOT NULL AND p_exit IS NOT NULL
                                 THEN weight END)
                      * 100.0
                  END AS held_through_pct,
                  CASE
                    WHEN SUM(CASE WHEN p0 IS NOT NULL AND p_exit IS NOT NULL
                                  THEN weight END) IS NULL THEN NULL
                    ELSE
                      SUM(CASE WHEN p0 IS NOT NULL AND p_exit IS NOT NULL
                               THEN weight * (p_exit*1.0/p0 - 1) END)
                      / SUM(CASE WHEN p0 IS NOT NULL AND p_exit IS NOT NULL
                                 THEN weight END)
                      * 100.0
                  END AS as_traded_pct
                FROM priced
            """), {"t0": t0, "t1": t1}).fetchone()

            pred = db.execute(text("""
                SELECT AVG(expected_return) * 100.0
                FROM mpt_results
                WHERE date(timestamp) = :t0
            """), {"t0": t0}).fetchone()

            held = round(agg[2], 2) if agg and agg[2] is not None else None
            traded = round(agg[3], 2) if agg and agg[3] is not None else None
            delta = round(traded - held, 2) if held is not None and traded is not None else None
            predicted = round(pred[0], 2) if pred and pred[0] is not None else None

            meta = keystone_meta.get(t0, {
                "is_keystone": False,
                "regime_run_count": None,
                "regime_signature": None,
            })

            rows.append({
                "run_date": t0,
                "forward_date": t1,
                "predicted_pct": predicted,
                "held_through_pct": held,
                "as_traded_pct": traded,
                **meta,
                "trading_delta": delta,
                "n_held": int(agg[0] or 0) if agg else 0,
                "n_sold": int(agg[1] or 0) if agg else 0,
            })

        return {"horizon_days": horizon_days, "rows": rows}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to compute MPT validation: {str(e)}")


@router.get("/mpt/params")
def get_mpt_params(db: Session = Depends(get_db)):
    """Return the active MPT model config from the three config tables.

    Shape:
        {
            "params": { gamma, target_risk, weight_lower, weight_upper,
                        gamma_smooth, updated_at, updated_by, notes },
            "sector_constraints": [{ sector, lower, upper, updated_at }, ...],
            "universe": [{ symbol, sector, in_modeling, notes, updated_at }, ...]
        }
    """
    try:
        params_row = db.execute(text("""
            SELECT gamma, target_risk, weight_lower, weight_upper,
                   gamma_smooth, updated_at, updated_by, notes
            FROM mpt_model_params WHERE id = 1
        """)).fetchone()
        params = None
        if params_row:
            params = {
                "gamma":        params_row[0],
                "target_risk":  params_row[1],
                "weight_lower": params_row[2],
                "weight_upper": params_row[3],
                "gamma_smooth": params_row[4],
                "updated_at":   params_row[5],
                "updated_by":   params_row[6],
                "notes":        params_row[7],
            }

        sectors = [
            {"sector": r[0], "lower": r[1], "upper": r[2], "updated_at": r[3]}
            for r in db.execute(text(
                "SELECT sector, lower, upper, updated_at "
                "FROM mpt_sector_constraints ORDER BY sector"
            )).fetchall()
        ]

        universe = [
            {"symbol": r[0], "sector": r[1], "in_modeling": bool(r[2]),
             "notes": r[3], "updated_at": r[4]}
            for r in db.execute(text(
                "SELECT symbol, sector, in_modeling, notes, updated_at "
                "FROM mpt_universe ORDER BY in_modeling DESC, symbol"
            )).fetchall()
        ]

        return {"params": params, "sector_constraints": sectors, "universe": universe}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load MPT params: {str(e)}")
