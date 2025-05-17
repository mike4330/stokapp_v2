# Security Management Procedure

## Overview
This document outlines the procedure for adding and removing securities in the MPMV2 system. The goal is to provide a clear, consistent process that ensures data integrity and proper system maintenance.

## Database Structure

The following tables are involved in security management:

1. `prices` - Stores price history and metadata
   - Primary key: `symbol`
   - Contains: asset_class, sector, industry, price, dividend_yield, etc.

2. `transactions` - Stores all buy/sell transactions
   - Primary key: `id`
   - Contains: symbol, date, price, units, gain, etc.

3. `MPT` - Stores Modern Portfolio Theory data
   - Primary key: `symbol`
   - Contains: target_alloc, sector, sector_short, financial ratios

4. `sectors` - Stores sector classification data
   - Primary key: `symbol`
   - Contains: sector, industry, subsector

5. `dividends` - Stores dividend payment history
   - Primary key: `id`
   - Contains: symbol, date, amount, frequency

6. `asset_classes` - Stores asset class classifications
   - Contains: symbol, class
   - Used to maintain consistent asset class categorization

## Table Relationships

- `prices` is the central table that links to all other tables via `symbol`
- `transactions` references `prices` via `symbol`
- `MPT` references `prices` via `symbol`
- `sectors` references `prices` via `symbol`
- `dividends` references `prices` via `symbol`
- `asset_classes` references `prices` via `symbol`

## Adding a New Security

### Prerequisites
1. Valid symbol that exists in the market
2. Asset class classification
3. Sector and industry classification
4. Current price
5. Dividend information (if applicable)

### Procedure
1. Add entry to `prices` table with:
   - Symbol
   - Asset class
   - Sector
   - Industry
   - Current price
   - Dividend yield (if applicable)

2. Add entry to `sectors` table with:
   - Symbol
   - Sector
   - Industry
   - Subsector (if available)

3. Add entry to `asset_classes` table with:
   - Symbol
   - Class (matching the asset_class from prices)

4. Add entry to `MPT` table with:
   - Symbol
   - Initial target allocation (if applicable)
   - Sector classification
   - Initial financial ratios

5. If dividend-paying:
   - Add entry to `dividends` table with:
     - Symbol
     - Initial dividend amount
     - Dividend frequency
     - Payment date

### API Endpoint
```http
POST /api/securities
Content-Type: application/json

{
  "symbol": "AAPL",
  "asset_class": "Equity",
  "sector": "Technology",
  "industry": "Consumer Electronics",
  "price": 150.00,
  "dividend_frequency": "quarterly"
}
```

## Removing a Security

### Prerequisites
1. No active holdings in the security
2. No pending transactions
3. No active dividend payments

### Procedure
1. Delete from `prices` table
2. Delete from `sectors` table
3. Delete from `asset_classes` table
4. Delete from `MPT` table
5. Delete from `dividends` table (if applicable)

### API Endpoint
```http
DELETE /api/securities/{symbol}
```

## Validation Rules

1. Symbol must be unique across all tables
2. Asset class must be one of: Equity, Fixed Income, Commodity, Currency
3. Asset class must be consistent between `prices` and `asset_classes` tables
4. Sector must be a valid sector from the sectors table
5. Price must be greater than 0
6. Dividend frequency must be one of: monthly, quarterly, or null

## Task-Based Workflow Implementation

A task-based asynchronous approach has been implemented for security management to provide better user experience and more robust error handling.

### Backend Implementation (FastAPI)

#### API Endpoints

1. **Adding Securities (Task-Based)**
   ```http
   POST /api/securities
   Content-Type: application/json
   ```
   - Returns a task ID for tracking the operation
   ```json
   {
     "task_id": "security_add_AAPL_1621534567",
     "message": "Security addition task initiated"
   }
   ```

2. **Task Status Checking**
   ```http
   GET /api/securities/tasks/{task_id}
   ```
   - Returns the current status of the task
   ```json
   {
     "id": "security_add_AAPL_1621534567",
     "status": "completed",
     "security": {
       "symbol": "AAPL",
       "asset_class": "Equity",
       "sector": "Technology",
       "industry": "Consumer Electronics",
       "price": 150.00,
       "dividend_frequency": "quarterly"
     },
     "steps": [
       {"name": "Add to prices table", "status": "completed"},
       {"name": "Add to sectors table", "status": "completed"},
       {"name": "Add to asset_classes table", "status": "completed"},
       {"name": "Add to MPT table", "status": "completed"},
       {"name": "Add to dividends table", "status": "completed"}
     ],
     "current_step": 4,
     "message": "Security AAPL added successfully",
     "created_at": "2023-05-20T12:34:56.789Z",
     "completed_at": "2023-05-20T12:35:01.123Z"
   }
   ```

3. **Retrieving Asset Classes**
   ```http
   GET /api/asset-classes
   ```
   - Returns a list of unique asset classes
   ```json
   ["Equity", "Fixed Income", "Commodity", "Currency"]
   ```

4. **Retrieving Securities**
   ```http
   GET /api/securities
   ```
   - Returns all securities in the system

#### Backend Workflow Steps

1. **Task Initialization**
   - Generate a unique task ID based on symbol and timestamp
   - Create initial task status object with pending steps
   - Schedule the background task

2. **Background Processing**
   - Execute database operations within a transaction
   - Update task status after each step
   - Commit transaction when all steps complete successfully
   - Roll back transaction on any error

3. **Transaction Management**
   - All database operations wrapped in a transaction
   - Ensures atomicity - either all operations succeed or none do
   - Proper error handling with transaction rollback on failure

4. **Task Status Storage**
   - In-memory task status storage (can be replaced with Redis or database in production)
   - Stores progress information for each step
   - Records timestamps for creation and completion

### Frontend Implementation (React)

#### UI Components

1. **Form for Collecting Security Data**
   - Symbol input field
   - Asset class dropdown (populated from asset-classes API endpoint)
   - Sector and industry input fields
   - Price input
   - Dividend frequency selection

2. **Confirmation Modal**
   - Shows planned operations before submission
   - Lists all database operations that will be performed
   - Conditional rendering for dividend-related operations
   - Warning about operation not being easily undone

3. **Progress Tracking Modal**
   - Real-time progress updates through polling
   - Step-by-step status indicators
   - Overall progress bar
   - Color-coded status displays
   - Animations for in-progress operations

#### Frontend Workflow

1. **Data Collection**
   - User completes form with security details
   - Form validation ensures required fields are filled

2. **Operation Confirmation**
   - Shows detailed breakdown of operations
   - User reviews and confirms

3. **Task Submission & Monitoring**
   - Submit request to backend
   - Receive task ID for tracking
   - Poll for task status updates
   - Update UI in real-time as operations progress
   - Show success/failure message upon completion

4. **Status Polling Implementation**
   - useEffect-based polling at regular intervals
   - Updates UI components based on task status
   - Disables close button until task completes or fails
   - Auto-refreshes security list on completion

## Error Handling

1. Duplicate symbol errors
2. Invalid asset class errors
3. Asset class inconsistency errors
4. Invalid sector errors
5. Price validation errors
6. Dividend frequency validation errors
7. Foreign key constraint violations
8. Dividend-related errors
9. Task execution errors with detailed status reporting

## Security Considerations

1. All operations require authentication
2. Rate limiting on API endpoints
3. Input validation for all fields
4. Audit logging of all changes
5. Backup before bulk operations
6. Transaction management for data integrity
7. Task-based approach prevents partial updates

## Maintenance Tasks

1. Regular price updates
2. Sector reclassification updates
3. Asset class verification and updates
4. Dividend payment updates
5. MPT data updates
6. Historical data cleanup
7. Task status cleanup for completed tasks

## Future Improvements

1. Batch operations for multiple securities
2. Bulk import/export functionality
3. Automated sector classification
4. Automated asset class classification
5. Enhanced validation rules
6. Real-time price updates
7. Automated dividend tracking
8. Sector reclassification automation
9. Historical data management
10. UI for managing securities
11. API for external integrations 
12. Persistent task storage in database
13. Email notifications for task completion
14. Export task history reports
15. Multi-level authorization for security operations 