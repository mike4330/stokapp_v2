# MPMv2 Internal Technical Documentation

This document contains technical implementation details, internal workflows, calculations, and development guidelines for the Market Portfolio Management V2 application.

## Architecture Overview

### Project Structure
- `/backend/` - FastAPI backend application
- `/frontend/` - React frontend application
- Production servers run on port 8000 (backend) and are served via nginx

### Technology Stack
- Frontend: React with TypeScript
- UI: Tailwind CSS
- Charts: Recharts
- Backend API: RESTful service (FastAPI)
- Scheduler: APScheduler (Python)

## Backend Technical Details

### Development and Testing

#### Backend Testing Environment
If you need to test the backend separately from the main application:

```bash
cd /var/www/mpmv2/backend
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Notes:**
- Main application runs on port 8000
- Use port 8001 for testing to avoid conflicts
- The backend directory contains the FastAPI application
- Hot reload is enabled for development

#### Production Configuration
- Production servers run on port 8000 (backend) and are served via nginx
- Environment variable support (`PRODUCTION=true`) for production deployments

## Scheduler Technical Implementation

The application includes a background task scheduler (using APScheduler) that automates key portfolio management tasks.

### Scheduled Jobs Configuration

**update_overamt**:
- Runs every 5 minutes during US market hours (9:00 AM - 4:00 PM ET, weekdays only)
- Updates portfolio metrics and calculations
- Market hours enforcement prevents unnecessary API calls

**price_updater**:
- Runs daily at 9:35 AM ET on weekdays
- Updates stock prices from external data sources
- Timing allows for market opening price stabilization

### Scheduler Monitoring
Check scheduler status and view registered jobs:
```
http://localhost:8000/scheduler/status
```

Scheduler activity is logged in the backend logs for debugging and monitoring.

## Frontend Technical Implementation

### Date Handling Rules

Critical implementation detail for consistent date handling across the application:

**For date-only strings (YYYY-MM-DD format) from the database:**
- **PREFER** using the date string as-is without parsing when possible
- **AVOID** `new Date(dateString)` as this causes timezone shifts
- **If parsing is required**, use local date parsing:
  ```javascript
  const [year, month, day] = dateString.split('-').map(Number);
  new Date(year, month - 1, day);
  ```

**Timezone Philosophy:**
- This app does not need timezone handling - keep dates simple
- All dates are treated as local dates to avoid confusion
- Database stores dates in YYYY-MM-DD format consistently

### UI/UX Implementation Details

- **Dark/light mode support** with theme persistence
- **Responsive design** optimized for desktop and mobile
- **Interactive drill-down capabilities** in charts and tables
- **Real-time updates** without manual refresh requirements

## Calculations and Algorithms

### Cost Basis and Return Calculations

#### Holdings Page Calculations (`backend/app/api/routes.py:255-284`)
**Cost Basis Calculation:**
```python
cost_basis = total_cost  # Direct assignment from transaction history sum
```

**Unrealized Gain/Loss Calculation:**
```python
market_value = net_units * current_price
gain_loss = market_value - cost_basis
gain_loss_pct = (gain_loss / cost_basis * 100) if cost_basis > 0 else 0
```

**Data Sources:**
- `net_units`: Sum from transactions table
- `total_cost`: Sum of transaction costs
- `current_price`: From prices table

#### Portfolio Analytics Calculations (`backend/app/api/portfolio_analytics_routes.py:58-64`)
**Return Percent Calculation:**
```python
unrealized_gain = position_value - total_cost
return_percent = (unrealized_gain / total_cost) * 100 if total_cost > 0 else 0.0
return_dollars = unrealized_gain
```

#### Total Return Calculation (`frontend/src/components/PositionDetails.tsx:43-44`)
**Comprehensive Return Calculation:**
```typescript
totalReturn = position.unrealized_gain + position.realized_pl + position.total_dividends
totalReturnPercent = position.cost_basis > 0 ? (totalReturn / position.cost_basis) * 100 : 0
```

**Components:**
- `unrealized_gain`: Current market value minus cost basis
- `realized_pl`: Realized gains/losses from sales
- `total_dividends`: Cumulative dividend income

#### Portfolio Visualization Returns (`backend/app/api/portfolio_visualization_routes.py:79`)
**Historical Return Calculation:**
```sql
((((close * shares) + cum_divs + cum_real_gl) - cost_basis) / cost_basis) * 100 as return_pct
```

**SQL Components:**
- `close * shares`: Current market value
- `cum_divs`: Cumulative dividends
- `cum_real_gl`: Cumulative realized gains/losses
- `cost_basis`: Historical cost basis

### **KNOWN DISCREPANCY AREAS**
1. **Data Source Differences**: Holdings page uses live transactions table vs Portfolio Performance uses historical snapshots
2. **Calculation Timing**: Real-time calculations vs historical data points
3. **Cost Basis Methodology**: Different aggregation methods across endpoints
4. **Return Components**: Inconsistent inclusion of dividends and realized gains

### **DISCREPANCY RESOLUTION PLAN**

#### Phase 1: Analysis and Documentation
1. **Compare Data Sources:**
   - Holdings page endpoint: `/holdings` (routes.py)
   - Portfolio Performance endpoint: `/portfolio/historical` (portfolio_performance_routes.py)
   - Identify which tables/queries each uses

2. **Validate Calculation Logic:**
   - Document exact SQL queries for each endpoint
   - Compare aggregation methods (SUM, grouping, joins)
   - Check date filtering and time-based calculations

3. **Data Integrity Checks:**
   - Verify transaction data completeness
   - Check for missing or duplicate entries
   - Validate price data consistency

#### Phase 2: Identify Root Cause
1. **Test with Known Data:**
   - Use specific symbols/dates for comparison
   - Calculate manually to verify expected results
   - Check for rounding differences

2. **Isolate Variables:**
   - Test with single position vs portfolio totals
   - Compare individual components (unrealized, realized, dividends)
   - Check historical vs current data points

#### Phase 3: Standardization
1. **Define Single Source of Truth:**
   - Choose primary calculation methodology
   - Establish consistent data source hierarchy
   - Document canonical formulas

2. **Implement Unified Calculations:**
   - Create shared calculation functions
   - Ensure consistent rounding and precision
   - Standardize date handling and time zones

#### Phase 4: Validation and Testing
1. **Cross-Validation:**
   - Compare results across all endpoints
   - Test edge cases (zero cost basis, negative returns)
   - Validate with historical data

2. **User Acceptance:**
   - Verify calculations match user expectations
   - Test with real portfolio data
   - Document any remaining limitations

### Modern Portfolio Theory (MPT) Implementation
- Portfolio optimization calculations
- Risk/return analysis
- Efficient frontier calculations
- Weight allocation algorithms

### Performance Metrics Calculations
- Real-time portfolio tracking calculations
- Position-level performance analysis
- Sector allocation analysis algorithms
- Return calculation methodologies

### Dividend Predictions
- Historical dividend analysis
- Trend-based prediction algorithms
- Seasonality adjustments
- Confidence interval calculations

### Buy Recommendations Engine

**Primary Implementation:** `/backend/app/api/mptroutes.py` - `GET /api/model-recommendations`

The buy recommendations engine uses a sophisticated multi-factor scoring algorithm:

**Algorithm Details:**
1. **Data Sources:** Combines data from `prices`, `MPT`, and `sectors` tables
2. **Feature Engineering:**
   - Transforms mean50/mean200 to price-relative ratios: `(price - mean) / price`
   - Calculates PE differential from sector average: `pe - average_pe`

3. **Standardization:** Uses sklearn's StandardScaler for statistical normalization (z-score)
   - Ensures all features contribute proportionally regardless of scale
   - Each feature normalized to mean=0, std=1

4. **Weighted Scoring:** Applies research-backed weights to standardized features:
   - RSI: 1.1 (technical momentum indicator)
   - PE_diff: 1.0 (valuation relative to sector)
   - volat: 0.8 (volatility/risk)
   - mean50: 0.85 (50-day moving average position)
   - mean200: 1.2 (200-day moving average position - stronger weight)
   - divyield: -1.3 (dividend yield - negative = good for buying)
   - div_growth_rate: -0.7 (dividend growth - negative = good)
   - fcf_ni_ratio: -1.2 (free cash flow to net income - negative = good)

5. **PE=0 Handling:** Stocks with PE ≤ 0 (no earnings) have PE_diff excluded from scoring
   - Relies on FCF/NI ratio and other metrics for unprofitable companies
   - Prevents misleading "undervaluation" signals

6. **Filtering:** Returns top 15 stocks with `overamt < -6` (underweight positions)
7. **Sorting:** Orders by z_score ascending (lower = better buy opportunity)

**External Integration:**
- The external trading script (`/var/www/html/portfolio/tasty/orderv2.py`) calls this API endpoint
- Ensures single source of truth across all systems
- SQL fallback available if API unavailable

## Internal Workflows

### Transaction Processing Workflow
1. Transaction validation and normalization
2. Lot tracking and assignment
3. Position updates and recalculation
4. Portfolio metrics refresh
5. Historical data point creation

### Price Update Workflow
1. External API data retrieval
2. Data validation and cleansing
3. Database update with transaction safety
4. Dependent calculation triggers
5. Real-time frontend updates

### Portfolio Rebalancing Workflow
1. Current allocation analysis
2. Target allocation comparison
3. Deviation calculation
4. Rebalancing recommendation generation
5. Transaction suggestion creation

## Development Guidelines

### Code Organization
- Domain-specific route separation for maintainability
- Centralized configuration management
- Consistent error handling patterns
- Comprehensive logging implementation

### Database Design Principles
- Normalized transaction storage
- Efficient indexing for performance queries
- Historical data preservation
- Audit trail maintenance

### API Design Standards
- RESTful endpoint structure
- Consistent response formats
- Comprehensive error responses
- Performance optimization techniques

## Performance Optimization

### Database Optimization
- Connection pooling implementation
- Query optimization strategies
- Index management
- Background task efficiency

### Frontend Optimization
- Component memoization strategies
- Lazy loading implementation
- Bundle size optimization
- Caching strategies

### Scheduler Optimization
- Resource-efficient task scheduling
- Error handling and retry logic
- Monitoring and alerting
- Performance metrics tracking