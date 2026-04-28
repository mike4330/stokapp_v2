# MPT Modeling System Documentation

> **Status (2026-04-28):** The interactive "what-if" UI described below is being
> retired. The optimization engine in `backend/app/portfolio_optimization.py`
> is presently hollow (does not call the optimizer) and `/api/run-mpt-modeling`
> and `/api/task-status/{id}` are stubs. The system is being redirected to a
> nightly scheduled job that runs a single canonical model — emulating the
> legacy `/var/www/html/portfolio/currentmodel` pipeline (`opt3.py` + `import.sh`)
> — with a simplified params-only UI on top of new `mpt_model_params` and
> `mpt_sector_constraints` tables. See "Current Database State" below; sections
> from "API Endpoints" onward describe the prior design and are kept for
> historical context only.

## Overview
This system implements Modern Portfolio Theory (MPT) optimization for portfolio management. It consists of a React-based frontend and a Python FastAPI backend, providing portfolio optimization capabilities with various objectives and constraints. The system dynamically loads symbols from the database and supports real-time data refresh from Yahoo Finance.

## Current Database State

Authoritative schema lives in `docs/schema.txt` (regenerable from the live DB).
This section describes only the tables that participate in the MPT pipeline.

### Live tables (read or written by current code)

| Table | Role | Writers | Readers |
|---|---|---|---|
| `MPT` | Picker source-of-truth — one row per tracked symbol with `target_alloc`, `RSI`, `pe`, `fcf_ni_ratio`, `sector`, `overamt`, `flag`, etc. | `overamt_task` (overamt/flag), `rsi_update_job` (RSI), legacy `import.sh` (target_alloc), legacy `miscattr3.py` (beta/pe/etc.) | `/api/model-recommendations`, `/api/mpt/*` endpoints |
| `prices` | Latest price per symbol + technical aggregates (`mean50`, `mean200`, `volat`, `hlr`, `divyield`, `vol90`, `alloc_target`) | `price_updater_task`, `xag_price_job`, `btc_price_job`, `moving_averages_task`, legacy `import.sh` (alloc_target) | Most charts; `/api/model-recommendations` |
| `sectors` | Per-symbol sector classification + sector P/E (`average_pe`) | `sector_pe_job` (average_pe) | `/api/model-recommendations` (PE_diff) |
| `weights` | Historical optimizer outputs — one row per symbol per run | Legacy `opt3.py` (today); planned `mpt_model_run_task` | Reports / charts |
| `mpt_results` | One row per optimizer run (gamma, lb, ub, target risk, expected_return, volatility, sharpe_ratio, weights_stdev) | Legacy `opt3.py` (today); planned `mpt_model_run_task` | Reports / charts |
| `expected_returns` | Per run × symbol expected returns. Offline analysis only — not consumed by app code. | Legacy `opt3.py` (today); planned `mpt_model_run_task` | (offline notebooks) |
| `historical` | Daily portfolio totals + WMA/YMA averages of past returns | `portfolio_stats_task` | Portfolio performance charts, `db/crud.py` |
| `security_values` | Daily per-symbol position snapshots (close, shares, cost_basis, cum_divs, cbps, cum_real_gl) | `security_values_snapshot_task` | History charts |

### Planned new tables (not yet created)

| Table | Purpose |
|---|---|
| `mpt_model_params` | Single-row table holding the active optimizer scalars (`gamma`, `target_risk`, `weight_lower`, `weight_upper`, `gamma_smooth`). Editable from the params UI; read by `mpt_model_run_task` at run time. |
| `mpt_sector_constraints` | One row per sector (`sector` PK, `lower`, `upper`). Replaces the hardcoded `sector_lower`/`sector_upper` dicts in `opt3.py`. Editable from the params UI; read by `mpt_model_run_task`. |

### Legacy / cruft (do not write to)

`MPT2`, `portfolio_data`, `portfolio`, `returns`, `xagtmp`, `sv_ark`, `w_ark`,
`transactions_ark`, `NET_CASH_FROM_OPS` — historical artifacts. See `schema.txt`
LEGACY/CRUFT annotations.



## Key Features
- **Dynamic Symbol Loading**: Automatically includes all securities with target allocations > 0 from the MPT database table
- **Real-time Data Refresh**: Optional fresh data download from Yahoo Finance
- **Multiple Optimization Objectives**: Maximum Sharpe, minimum volatility, efficient frontier targets
- **Sector Constraints**: Configurable sector allocation bounds with FBonds/DBonds support
- **Asynchronous Processing**: Background task execution with status polling
- **Comprehensive Debugging**: Detailed optimization information and data source tracking

## System Components

### Frontend Components
- `frontend/src/pages/MPTModelling.tsx`: Main React component for the MPT modeling interface
  - Handles user input for optimization parameters
  - Displays optimization results with interactive bar charts
  - Manages real-time data refresh and task status polling
  - Shows data source information (database vs static files)

### Backend Components
- `backend/app/mpt_modeling.py`: FastAPI endpoint handlers and task management
  - Manages optimization tasks asynchronously
  - Provides task status tracking
  - Handles parameter validation

- `backend/app/portfolio_optimization.py`: Core optimization engine
  - Implements portfolio optimization algorithms using PyPortfolioOpt
  - Dynamic symbol loading from MPT database table
  - Handles data management and caching
  - FBonds/DBonds sector mapping kludge
  - Comprehensive error handling and logging

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
  "task_id": string,
  "message": "MPT modeling task initiated"
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
      "config_files": {
        "status": "success" | "error",
        "data_source": "database",
        "tickers_count": number,
        "sectors_count": number,
        "query_info": {
          "symbols_with_allocation": number,
          "sectors_mapped": number
        },
        "fbonds_dbonds_overrides": {
          [symbol: string]: "FBonds" | "DBonds"
        }
      },
      "optimization": {
        "status": "success" | "error",
        "solver_status": "optimal" | "infeasible",
        "data_shape": string,
        "data_info": {
          "missing_tickers": string[],
          "price_range": {
            "start": string,
            "end": string
          }
        }
      }
    }
  } | null,
  "error": string | null
}
```

### GET `/api/mpt/symbols-with-allocation`
Returns symbols with target allocations from the MPT table.

**Response:**
```json
[
  {
    "symbol": string,
    "target_alloc": number
  }
]
```

### GET `/api/mpt`
Returns symbol and sector mapping from MPT table.

**Response:**
```json
[
  {
    "symbol": string,
    "sector": string
  }
]
```

## Dynamic Symbol Management

### Database-Driven Symbol Loading
The system now dynamically loads symbols from the database instead of static configuration files:

1. **Query**: `SELECT symbol, target_alloc FROM MPT WHERE target_alloc > 0`
2. **Automatic Inclusion**: Any symbol with a target allocation > 0 is automatically included
3. **No Manual Maintenance**: No need to update static `tickers.txt` file
4. **Real-time Updates**: New symbols with allocations are immediately available

### Sector Mapping
Sector mappings are loaded from the database with a special kludge for bonds:

1. **Primary Source**: Database `MPT.sector` field
2. **FBonds/DBonds Override**: Text file `sectormap.txt` provides FBonds/DBonds mappings
3. **Automatic Override**: Symbols mapped to "Bonds" in database get overridden with FBonds/DBonds from text file

## Data Management

### Price Data Cache
- **Location**: `backend/app/pricedataset.csv`
- **Content**: Historical price data for all symbols with target allocations
- **Size**: ~2.5MB with 10 years of daily data
- **Update**: Refreshed when `refreshData: true` or cache missing

### Data Refresh Process
1. **Check Cache**: System first tries to load from `pricedataset.csv`
2. **Missing Symbols**: Identifies symbols without price data
3. **Refresh Option**: User can force fresh download from Yahoo Finance
4. **Automatic Handling**: Missing cache triggers automatic download

### Missing Data Handling
- **Detection**: System identifies symbols without price data
- **Reporting**: Missing symbols listed in debug information
- **Filtering**: Optimization excludes symbols without price data
- **User Notification**: Debug panel shows data source and missing symbols

## Sector Constraints & FBonds/DBonds Kludge

### The Challenge
- **Database**: Stores all bonds as "Bonds" sector
- **Optimization**: Expects separate "FBonds" and "DBonds" sectors
- **Constraints**: Default sector constraints reference FBonds/DBonds

### The Solution
1. **Load from Database**: Get all symbols and their "Bonds" sector
2. **Read Text File**: Parse `sectormap.txt` for FBonds/DBonds mappings
3. **Apply Overrides**: Update specific symbols from "Bonds" to "FBonds"/"DBonds"
4. **Debug Tracking**: Record which symbols were overridden

### Override Mapping
Currently 10 symbols get overridden:
- **FBonds**: JPIB, BNDX, PGHY (3 symbols)
- **DBonds**: ANGL, FAGIX, FNBGX, LKOR, SJNK, TDTF, VCSH (7 symbols)

## Configuration Files (Legacy Support)

### `backend/app/config/sectormap.txt`
Used only for FBonds/DBonds sector overrides. Format:
```
SYMBOL,SECTOR
ANGL,DBonds
JPIB,FBonds
...
```

### `backend/app/config/tickers.txt` 
**DEPRECATED**: No longer used for symbol loading. Symbols now loaded dynamically from database.

## Optimization Features

### Optimization Objectives
- **Maximum Sharpe Ratio**: Maximize risk-adjusted returns
- **Minimum Volatility**: Minimize portfolio risk
- **Efficient Risk**: Target specific volatility level
- **Efficient Return**: Target specific return level

### Constraints
- **Weight Bounds**: Individual asset minimum/maximum weights
- **Sector Constraints**: Sector-level allocation bounds
- **L2 Regularization**: Optional regularization parameter (gamma)
- **Sum to One**: Portfolio weights sum to 100%

### Solver Details
- **Engine**: PyPortfolioOpt with CVXPY backend
- **Solver**: OSQP (Operator Splitting Quadratic Program)
- **Status Tracking**: Optimal/infeasible solution detection
- **Performance**: Typical solve time under 1 second

## Logging
- **Location**: `backend/app/logs/portfolio_optimization.log`
- **Format**: Timestamped with detailed debugging information
- **Rotation**: 10MB per file, 5 backup files
- **Content**: Symbol loading, optimization progress, sector overrides, errors

## Frontend Features

### Interactive Results Display
- **Bar Chart**: Sortable weight visualization with Recharts
- **Weight Table**: Sortable grid of all portfolio weights
- **Performance Metrics**: Expected return, volatility, Sharpe ratio
- **Sector Allocations**: Breakdown by sector when constraints used

### Debug Information Panel
- **Data Source**: Shows "database" vs "static files"
- **Symbol Count**: Number of symbols loaded and used
- **Missing Data**: Lists symbols without price data
- **Sector Overrides**: Count of FBonds/DBonds overrides applied
- **Optimization Status**: Solver results and performance

### User Controls
- **Refresh Data Toggle**: Force Yahoo Finance data download
- **Sector Constraints**: Enable/disable with configurable bounds
- **Parameter Inputs**: All optimization parameters with validation
- **Save to Repository**: Store optimization results

## Error Handling

### Data Issues
- **Missing Symbols**: Graceful handling of symbols without price data
- **Invalid Constraints**: Validation of sector constraint consistency
- **Database Errors**: Fallback error messages for database connection issues

### Optimization Failures
- **Infeasible Problems**: Clear error messages for impossible constraints
- **Solver Errors**: Detailed solver status reporting
- **Timeout Handling**: Background task timeout management

### User Feedback
- **Loading States**: Clear indication of long-running processes
- **Error Messages**: User-friendly error descriptions
- **Status Updates**: Real-time progress indication

## Performance Considerations

### Database Queries
- **Optimized Queries**: Single queries for symbols and sectors
- **Connection Management**: Proper database connection lifecycle
- **Error Recovery**: Graceful handling of database unavailability

### Data Caching
- **Yahoo Finance Caching**: Requests cached to avoid rate limits
- **Price Data Persistence**: CSV cache for historical data
- **Selective Refresh**: Only download data when necessary

### Frontend Optimization
- **Polling Strategy**: 2-second intervals for status checking
- **State Management**: Efficient React state updates
- **Chart Performance**: Optimized data preparation for visualizations

## Future Improvements

### Data Management
1. **Database Price Storage**: Move from CSV to database storage
2. **Incremental Updates**: Only download missing date ranges
3. **Multiple Data Sources**: Support for additional price data providers

### Sector Management
1. **Database Schema Update**: Add separate FBonds/DBonds sectors to database
2. **Sector Hierarchy**: Support for sector/subsector relationships
3. **Dynamic Constraints**: Generate constraints from target allocations

### User Experience
1. **Real-time Validation**: Immediate feedback on constraint conflicts
2. **Constraint Visualization**: Show feasible region graphically
3. **Historical Comparison**: Compare current vs previous optimizations

### Advanced Features
1. **Risk Models**: Alternative risk model implementations
2. **Transaction Costs**: Include trading costs in optimization
3. **ESG Constraints**: Environmental/social/governance filters
4. **Multi-Period Optimization**: Dynamic rebalancing strategies 