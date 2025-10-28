# File Handle Optimization

This document explains the changes made to reduce file handle usage in the MPMV2 backend.

## Problem

The uvicorn server was creating excessive file handles due to:

1. **Multiple worker processes/threads** each opening their own log file handles
2. **Unsafe logging configuration** with each process/thread creating separate file handlers
3. **Multiple SQLite connections** without proper connection pooling
4. **APScheduler thread/process pools** spawning many workers

## Solutions Implemented

### 1. Multiprocess-Safe Logging (`app/core/logging_config.py`)

- **Single file handler per log file** with thread-safe rotation
- **Centralized logging configuration** to prevent duplicate handlers
- **Thread-safe file handler** using locks to prevent race conditions
- **Separate loggers** for different components (app, portfolio_optimization, scheduler)

### 2. Reduced Worker Processes (`app/scheduler/config.py`)

- **ThreadPoolExecutor**: Reduced from 5 to 2 workers
- **ProcessPoolExecutor**: Reduced from 3 to 1 worker
- This significantly reduces the number of processes that could open file handles

### 3. Database Connection Pooling (`app/db/session.py`)

- **Static connection pool** limited to 5 connections
- **No overflow connections** to prevent unlimited connection growth
- **Connection recycling** after 1 hour to prevent stale connections
- **Optimized SQLite pragmas** for better performance and concurrency

### 4. Production Configuration (`run.py`)

- **Disable reload in production** to prevent multiple worker processes
- **Environment variable support** (`PRODUCTION=true`) for production deployments
- **Single worker** in development mode

## Monitoring

Use the provided monitoring script to check file handle usage:

```bash
cd backend
python3 monitor_handles.py
```

This script will show:
- Total file handles per uvicorn process
- Number of log file handles
- Number of SQLite file handles
- Warnings for excessive usage

## Expected Results

After implementing these changes, you should see:

- **Fewer log file handles**: 2-3 instead of 8+ (one per log file, not per worker)
- **Fewer SQLite handles**: Maximum of 5 connections instead of unlimited
- **Better overall performance** due to reduced resource contention
- **More stable logging** without race conditions

## Deployment

### Development

```bash
# Normal development mode (with reload)
python run.py
```

### Production

```bash
# Production mode (no reload, optimized)
PRODUCTION=true python run.py
```

## Troubleshooting

If you still see high file handle usage:

1. **Check for long-running processes**: Some scheduled tasks might be holding connections
2. **Monitor over time**: Use `monitor_handles.py` regularly to track trends
3. **Check logs**: Look for database connection errors or logging issues
4. **Restart the server**: If handles are stuck, a restart will clear them

## Additional Recommendations

For even better resource management:

1. **Use systemd or process manager** in production for better process control
2. **Consider external logging** (syslog, centralized logging) for high-scale deployments
3. **Monitor system-wide file handle limits** with `ulimit -n`
4. **Set up alerts** for excessive file handle usage

## Files Modified

- `app/core/logging_config.py` - New multiprocess-safe logging
- `app/main.py` - Updated to use new logging configuration  
- `app/portfolio_optimization.py` - Removed custom logging setup
- `app/scheduler/config.py` - Reduced worker counts
- `app/db/session.py` - Added connection pooling
- `run.py` - Added production configuration
- `monitor_handles.py` - New monitoring script

## SQLite Threading Issues Fixed (2025-07-11)

### Problem
Uvicorn was experiencing segmentation faults caused by SQLite threading conflicts. The issue occurred when multiple components accessed the same SQLite database simultaneously using different connection patterns:

- **BTC/XAG price tasks**: Used direct `sqlite3.connect()` calls
- **Other scheduler tasks**: Used SQLAlchemy sessions with proper connection pooling
- **API routes**: Used SQLAlchemy dependency injection

### Root Cause
Mixed connection patterns created threading conflicts when:
1. BTC job (hourly) coincided with price updater (continuous during market hours)
2. Multiple tasks accessed the same database file with different connection types
3. SQLite's threading limitations were exceeded

### Solution Applied
**Converted all price tasks to use SQLAlchemy sessions**:

1. **BTC price task** (`app/scheduler/tasks/btc_price_task.py`):
   - Replaced direct `sqlite3.connect()` with `get_db()` session
   - Used proper SQLAlchemy ORM operations
   - Added transaction rollback on errors

2. **XAG price task** (`app/scheduler/tasks/xag_price_task.py`):
   - Replaced direct `sqlite3.connect()` with `get_db()` session
   - Converted SQL queries to SQLAlchemy ORM operations
   - Added proper error handling and rollback

3. **Removed unused ProcessPoolExecutor** (`app/scheduler/config.py`):
   - Eliminated ProcessPoolExecutor which was causing semaphore leaks
   - Only ThreadPoolExecutor is used, preventing multiprocessing resource conflicts

### System Logs Evidence
```
[1197622.067771] traps: uvicorn[4741] general protection fault ip:7fda5e0753f9 sp:7fda276fb0e8 error:0 in libsqlite3.so.0.8.6
python3: tpp.c:83: __pthread_tpp_change_priority: Assertion `new_prio == -1 || (new_prio >= fifo_min_prio && new_prio <= fifo_max_prio)' failed.
resource_tracker: There appear to be 5 leaked semaphore objects to clean up at shutdown
```

The fixes ensure:
- All database access uses consistent SQLAlchemy sessions
- No mixed connection patterns between sqlite3 and SQLAlchemy
- No ProcessPoolExecutor semaphore leaks
- Eliminated pthread priority assertion failures 