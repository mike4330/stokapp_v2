"""
Process management utilities for the scheduler.
"""
import os
import signal
import psutil
import logging
from typing import Optional

logger = logging.getLogger(__name__)

def get_scheduler_processes() -> list[psutil.Process]:
    """Get all scheduler-related processes."""
    current_process = psutil.Process()
    scheduler_processes = []
    
    # Get all child processes
    for child in current_process.children(recursive=True):
        try:
            # Check if it's a scheduler process by looking at the command line
            cmdline = child.cmdline()
            if any('python' in cmd.lower() for cmd in cmdline):
                scheduler_processes.append(child)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
            
    return scheduler_processes

def cleanup_scheduler_processes():
    """Clean up all scheduler-related processes."""
    processes = get_scheduler_processes()
    for process in processes:
        try:
            logger.info(f"Sending SIGTERM to process {process.pid}")
            process.send_signal(signal.SIGTERM)
            process.wait(timeout=5)  # Wait up to 5 seconds for graceful shutdown
        except psutil.TimeoutExpired:
            logger.warning(f"Process {process.pid} did not terminate gracefully, sending SIGKILL")
            process.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied) as e:
            logger.warning(f"Error cleaning up process {process.pid}: {str(e)}")

def register_shutdown_handlers():
    """Register signal handlers for graceful shutdown."""
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, initiating shutdown")
        cleanup_scheduler_processes()
        os._exit(0)  # Force exit after cleanup
        
    # Register handlers for common termination signals
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGQUIT, signal_handler) 