# MPT Modeling System Documentation

## Overview
This system implements Modern Portfolio Theory (MPT) optimization for portfolio management. It consists of a React-based frontend and a Python FastAPI backend, providing portfolio optimization capabilities with various objectives and constraints.

## System Components

### Frontend Components
- `frontend/src/pages/MPTModelling.tsx`: Main React component for the MPT modeling interface
  - Handles user input for optimization parameters
  - Displays optimization results and debug information
  - Manages real-time data refresh and task status polling

### Backend Components
- `backend/app/mpt_modeling.py`: FastAPI endpoint handlers and task management
  - Manages optimization tasks asynchronously
  - Provides task status tracking
  - Handles parameter validation

- `backend/app/portfolio_optimization.py`: Core optimization engine
  - Implements portfolio optimization algorithms
  - Handles data management and caching
  - Provides comprehensive error handling and logging

## API Endpoints

### POST `/api/run-mpt-modeling`
Initiates a new portfolio optimization task.

**Request Body:**
```json
{
  "gamma": number | null,
  "targetReturn": number,
  "targetRisk": number,
  "lowerBound": number,
  "upperBound": number,
  "objective": "max_sharpe" | "min_volatility" | "efficient_risk" | "efficient_return",
  "refreshData": boolean,
  "useSectorConstraints": boolean,
  "sectorConstraints": {
    [sector: string]: {
      "min": number,
      "max": number
    }
  } | null
}
```

**Response:**
```json
{
  "task_id": string
}
```

### GET `/api/task-status/{task_id}`
Retrieves the status of an optimization task.

**Response:**
```json
{
  "status": "running" | "completed" | "failed" | "not_found",
  "result": {
    "weights": { [ticker: string]: number },
    "expected_return": number,
    "volatility": number,
    "sharpe_ratio": number,
    "sector_weights": { [sector: string]: number },
    "debug_info": {
      // Debug information object
    }
  } | null,
  "error": string | null
}
```

## Configuration Files

### `backend/app/config/tickers.txt`
Contains the list of tickers used in the optimization.

### `backend/app/config/sectormap.txt`
Maps tickers to their respective sectors.

## Data Management
- Historical price data is stored in `backend/app/pricedataset.csv`
- Data can be refreshed from Yahoo Finance on demand
- Requests are cached using `requests_cache`

## Optimization Features
- Multiple optimization objectives:
  - Maximum Sharpe ratio
  - Minimum volatility
  - Efficient frontier (risk/return targets)
- Sector constraints
- L2 regularization
- Weight bounds
- Comprehensive error handling and debugging

## Logging
- Detailed logging implemented in `portfolio_optimization.py`
- Logs stored in `backend/app/logs/portfolio_optimization.log`
- Rotating file handler with 10MB per file, 5 backup files 