# Portfolio Tracker Backend

This is the FastAPI backend for the Stock Portfolio Tracker application, providing a robust API for portfolio management, analysis, and automation.

## Features

### Portfolio Management
- Real-time portfolio tracking and position management
- Transaction management with lot tracking
- Account-based portfolio organization
- Symbol search and lookup functionality

### Analysis Tools
- Modern Portfolio Theory (MPT) modeling and analysis
- Sector allocation analysis
- Portfolio performance tracking
- Historical data analysis
- Market value tracking
- Return calculations and analysis

### Data Models
- Price tracking with technical indicators
- Transaction history with lot management
- Security value tracking
- MPT (Modern Portfolio Theory) data
- Portfolio weights and allocations

### Automation
- Background task scheduler
- Real-time price updates
- Portfolio metrics updates
- Automated data collection

## API Endpoints

### Portfolio Management
- `GET /holdings` - List all holdings
- `GET /holdings/{symbol}` - Get details for a specific holding
- `GET /positions/{symbol}` - Get detailed position information
- `GET /positions/{symbol}/price-history` - Get price history for a symbol
- `GET /positions/{symbol}/market-value-history` - Get market value history
- `GET /positions/{symbol}/returns` - Get returns data for a symbol
- `GET /positions/{symbol}/transactions` - Get transactions for a symbol

### Transactions
- `GET /transactions` - List recent transactions
- `POST /transactions` - Create a new transaction
- `PUT /transactions/{transaction_id}` - Update a transaction
- `GET /open-lots` - Get all open lots
- `GET /potential-lots` - Get potential lots for selling

### Analysis
- `GET /sector-allocation` - Get sector allocation data
- `GET /model-recommendations` - Get model-based recommendations
- `GET /portfolio/historical` - Get historical portfolio data
- `GET /portfolio/returns` - Get portfolio returns data
- `GET /portfolio/sunburst` - Get portfolio visualization data
- `GET /returns/by-security` - Get returns by security
- `GET /weights` - Get symbol weights

### MPT Modeling
- `GET /mpt` - Get MPT data
- `POST /run-mpt-modeling` - Run MPT modeling
- `GET /task-status/{task_id}` - Check MPT modeling task status

### Utility
- `GET /accounts` - List all accounts
- `GET /symbols/search` - Search for symbols
- `GET /data-status` - Check data status
- `GET /debug/historical-table` - Debug historical data

## Data Models

### Price
- Symbol tracking
- Technical indicators (mean50, mean200)
- Asset class and allocation targets
- Volatility metrics
- Dividend yield

### Transaction
- Buy/sell transactions
- Lot tracking
- Gain/loss calculation
- Account management
- Fee tracking

### SecurityValue
- Price history
- Volume tracking
- Cost basis
- Returns calculation
- Dividend tracking

### MPT
- Sector and industry classification
- Market cap and PE ratio
- Target allocation
- Technical indicators
- Dividend growth rate

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables (create a .env file in the backend directory):
```
DB_PATH=app/db/mpmv2.db
HOST=0.0.0.0
PORT=8000
```

## Running the Application

Run the application with:
```bash
python run.py
```

Or directly with uvicorn:
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Scheduler

The application includes a task scheduler that runs tasks at specified intervals:

- `update_overamt` - Runs every 5 minutes during US market hours (9:00 AM - 4:00 PM ET, weekdays only)
- `price_updater` - Runs daily at 9:35 AM ET on weekdays

### Testing the Scheduler

To check the scheduler status, visit:
```
http://localhost:8000/scheduler/status
```

This will show:
- The current scheduler status (running/stopped)
- List of registered jobs
- Next run time for each job

You can also check the app logs for scheduler activities:
```bash
tail -f app.log
```

## API Documentation

The API documentation is available at:
```
http://localhost:8000/docs
```

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](../LICENSE) file for details. 