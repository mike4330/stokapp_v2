# Portfolio Optimization API Documentation

## Endpoints

### Run MPT Modeling

**Endpoint:** `POST /api/run-mpt-modeling`

Initiates a new portfolio optimization task with the specified parameters.

#### Request Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| gamma | number \| null | No | L2 regularization parameter. Only used when objective is not 'max_sharpe' |
| targetReturn | number | Yes | Target annual return for the portfolio (used for 'efficient_return' objective) |
| targetRisk | number | Yes | Target annual volatility (used for 'efficient_risk' objective) |
| lowerBound | number | Yes | Minimum weight for any individual asset |
| upperBound | number | Yes | Maximum weight for any individual asset |
| objective | string | Yes | Optimization objective ('max_sharpe', 'min_volatility', 'efficient_risk', 'efficient_return') |
| refreshData | boolean | No | Whether to refresh price data from Yahoo Finance |
| useSectorConstraints | boolean | No | Whether to apply sector constraints |
| sectorConstraints | object | No | Sector-specific weight constraints |

#### Example Request
```json
{
  "gamma": 1.98,
  "targetReturn": 0.07,
  "targetRisk": 0.1286,
  "lowerBound": 0.00131,
  "upperBound": 0.0482,
  "objective": "efficient_return",
  "refreshData": false,
  "useSectorConstraints": true,
  "sectorConstraints": {
    "Tech": {
      "min": 0.0674,
      "max": 0.20
    },
    "Healthcare": {
      "min": 0.0534,
      "max": 0.08
    }
  }
}
```

#### Response
```json
{
  "task_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Check Task Status

**Endpoint:** `GET /api/task-status/{task_id}`

Retrieves the current status and results of an optimization task.

#### URL Parameters
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| task_id | string | Yes | The ID of the task to check |

#### Response Structure
```json
{
  "status": "completed",
  "result": {
    "weights": {
      "AAPL": 0.05,
      "GOOGL": 0.04,
      // ... other ticker weights
    },
    "expected_return": 0.085,
    "volatility": 0.15,
    "sharpe_ratio": 0.48,
    "sector_weights": {
      "Tech": 0.18,
      "Healthcare": 0.07,
      // ... other sector weights
    },
    "debug_info": {
      "config_files": {
        "status": "success",
        "tickers_count": 100,
        "sectors_count": 16
      },
      "optimization": {
        "status": "success",
        "solver_status": "optimal",
        "data_shape": "2500 days × 100 assets"
      }
    }
  }
}
```

## Error Handling

### Error Response Structure
```json
{
  "status": "failed",
  "error": "Error message describing what went wrong",
  "result": null
}
```

### Common Error Scenarios

1. **Invalid Parameters**
   - Missing required parameters
   - Invalid parameter values (e.g., negative weights)
   - Incompatible parameter combinations

2. **Data Issues**
   - Missing price data
   - Corrupted data files
   - Failed Yahoo Finance data refresh

3. **Optimization Failures**
   - Infeasible constraints
   - Numerical instability
   - Solver failures

## Rate Limiting
- Maximum of 10 concurrent optimization tasks
- Rate limit of 60 requests per minute per IP
- Optimization tasks timeout after 5 minutes

## Data Refresh Considerations
- Yahoo Finance data refresh may take several minutes for large ticker lists
- Cache expires after 24 hours
- Failed refreshes fall back to cached data 