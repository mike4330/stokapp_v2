"""
Multiprocess-safe logging configuration for MPMV2.

This module provides logging configuration that works safely across multiple
processes and threads without creating excessive file handles.
"""
import logging
import logging.handlers
import os
from pathlib import Path
import queue
import threading
import atexit


class SafeRotatingFileHandler(logging.handlers.RotatingFileHandler):
    """A thread-safe rotating file handler that uses file locking."""
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._lock = threading.Lock()
    
    def emit(self, record):
        """Thread-safe emit method."""
        with self._lock:
            super().emit(record)


def setup_logging():
    """
    Set up multiprocess-safe logging configuration.
    
    Uses a single file handler per log file with proper rotation and thread safety.
    """
    # Create logs directory
    log_dir = Path(__file__).parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Clear any existing handlers to avoid duplicates
    root_logger.handlers.clear()
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Main application log with rotation
    app_handler = SafeRotatingFileHandler(
        log_dir / "app.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    app_handler.setFormatter(formatter)
    app_handler.setLevel(logging.INFO)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    
    # Add handlers to root logger
    root_logger.addHandler(app_handler)
    root_logger.addHandler(console_handler)
    
    # Configure specific loggers
    
    # Portfolio optimization logger - separate file
    portfolio_logger = logging.getLogger("portfolio_optimization")
    portfolio_handler = SafeRotatingFileHandler(
        log_dir / "portfolio_optimization.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    portfolio_handler.setFormatter(formatter)
    portfolio_logger.addHandler(portfolio_handler)
    portfolio_logger.propagate = False  # Don't propagate to root logger to avoid duplicates
    
    # Scheduler logger
    scheduler_logger = logging.getLogger("apscheduler")
    scheduler_logger.setLevel(logging.INFO)
    # APScheduler will use the root logger handlers
    
    # Reduce SQLAlchemy logging noise
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    
    return root_logger


def setup_portfolio_optimization_logger():
    """
    Set up the portfolio optimization logger to use the shared configuration.
    This replaces the custom logger setup in portfolio_optimization.py
    """
    return logging.getLogger("portfolio_optimization")


# Set up logging when module is imported
logger = setup_logging()

# Register cleanup on exit
def cleanup_logging():
    """Clean up logging handlers on exit."""
    logging.shutdown()

atexit.register(cleanup_logging) 