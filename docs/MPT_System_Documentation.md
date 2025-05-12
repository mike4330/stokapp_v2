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

## MPT Modeling Component Details

### Component Overview
The MPT Modeling component (`MPTModelling.tsx`) is a React component that provides a user interface for portfolio optimization using Modern Portfolio Theory. It allows users to configure optimization parameters, view results, and monitor the optimization process.

### Component Structure

#### State Management
```typescript
// Core optimization parameters
const [gamma, setGamma] = useState('1.98');
const [targetReturn, setTargetReturn] = useState('0.07');
const [targetRisk, setTargetRisk] = useState('0.1286');
const [lowerBound, setLowerBound] = useState('0.00131');
const [upperBound, setUpperBound] = useState('0.0482');
const [objective, setObjective] = useState('max_sharpe');

// Feature toggles and constraints
const [useSectorConstraints, setUseSectorConstraints] = useState(false);
const [refreshData, setRefreshData] = useState(false);
const [sectorConstraints, setSectorConstraints] = useState<SectorConstraints>(DEFAULT_SECTOR_CONSTRAINTS);

// Task management and results
const [modelingResult, setModelingResult] = useState<ModelingResult | null>(null);
const [modelingLoading, setModelingLoading] = useState(false);
const [modelingError, setModelingError] = useState<string | null>(null);
const [taskId, setTaskId] = useState<string | null>(null);
```

### Key Interfaces

#### OptimizationConstraints
```typescript
interface OptimizationConstraints {
  gamma: number;
  target_return: number;
  lower_bound: number;
  upper_bound: number;
  refresh_data: boolean;
  sector_lower: { [key: string]: number };
  sector_upper: { [key: string]: number };
}
```

#### ModelingResult
```typescript
interface ModelingResult {
  weights: { [key: string]: number };
  expected_return: number;
  volatility: number;
  sharpe_ratio: number;
  sector_weights: { [key: string]: number };
  debug_info: OptimizationDebugInfo;
}
```

### Features

#### 1. Optimization Parameter Configuration
- Gamma (L2 regularization)
- Target return and risk
- Weight bounds
- Optimization objective selection
- Sector constraints

#### 2. Data Management
- Option to refresh data from Yahoo Finance
- Data status monitoring
- Cache management

#### 3. Task Management
- Asynchronous task handling
- Status polling
- Error handling
- Loading states

#### 4. Results Display
- Portfolio weights
- Performance metrics
- Sector allocations
- Debug information

### Key Functions

#### handleRunModeling
```typescript
const handleRunModeling = async () => {
  // Initiates the optimization process
  // Handles API communication and error states
}
```

#### pollTaskStatus
```typescript
const pollTaskStatus = async (taskId: string) => {
  // Polls the backend for task status
  // Updates UI based on task progress
}
```

#### handleSectorConstraintChange
```typescript
const handleSectorConstraintChange = (
  sector: string,
  type: 'min' | 'max',
  value: string
) => {
  // Updates sector constraints
}
```

### UI Sections

#### 1. Parameter Input Form
- Optimization objective selector
- Numerical input fields for parameters
- Validation and constraints

#### 2. Sector Constraints Panel
- Toggle for sector constraints
- Grid of sector weight inputs
- Min/max constraints per sector

#### 3. Results Display
- Performance metrics cards
- Weight distribution tables
- Debug information panel

#### 4. Status and Controls
- Run button with loading state
- Data refresh toggle
- Status messages
- Error displays

### Usage Example

```tsx
// In a parent component or page
import MPTModelling from './pages/MPTModelling';

function App() {
  return (
    <div className="app">
      <MPTModelling />
    </div>
  );
}
```

### Styling
- Uses Tailwind CSS for styling
- Responsive design
- Dark mode support
- Custom color scheme (green-based)

### Error Handling
1. Input Validation
   - Numeric bounds checking
   - Required field validation
   - Constraint consistency

2. API Error Handling
   - Network errors
   - Task failures
   - Timeout handling

3. User Feedback
   - Error messages
   - Loading states
   - Status updates

### Performance Considerations
- Debounced input handling
- Optimized re-renders
- Efficient status polling
- Cached API responses

### Future Improvements
1. Add visualization components
   - Efficient frontier plot
   - Weight distribution charts
   - Performance attribution graphs

2. Enhanced user interactions
   - Drag-and-drop weight adjustment
   - Interactive constraint setting
   - Real-time validation

3. Additional features
   - Portfolio comparison
   - Historical backtesting
   - Custom asset groups 