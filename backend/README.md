# Portfolio Tracker Backend

This is the FastAPI backend for the Stock Portfolio Tracker application.

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

## Endpoints

- `/api/holdings` - List all holdings
- `/api/transactions` - List recent transactions
- `/api/holdings/{symbol}` - Get details for a specific holding
- `/api/sector-allocation` - Get sector allocation data
- `/scheduler/status` - Get scheduler status 