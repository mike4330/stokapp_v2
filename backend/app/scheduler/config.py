"""Scheduler configuration module."""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.executors.pool import ThreadPoolExecutor
from apscheduler.triggers.cron import CronTrigger
from pytz import timezone
import logging
import json
import os
from pathlib import Path

# Configure logging for the scheduler
scheduler_logger = logging.getLogger('apscheduler')
scheduler_logger.setLevel(logging.INFO)

# Define market hours (US Eastern Time - ET)
US_EASTERN = timezone('US/Eastern')
MARKET_OPEN_HOUR = 9  # 9:30 AM ET is standard market open, using 9 to be safe
MARKET_CLOSE_HOUR = 16  # 4:00 PM ET is standard market close

# Create a ThreadPoolExecutor
executors = {
    'default': ThreadPoolExecutor(max_workers=5)
}

# Configure job defaults
job_defaults = {
    'coalesce': True,  # Combine multiple pending executions of the same job into a single execution
    'max_instances': 1,  # Limit each job to only have one instance running at a time
    'misfire_grace_time': 60  # Allow jobs up to 60 seconds late
}

# Create the scheduler
scheduler = BackgroundScheduler(
    executors=executors,
    job_defaults=job_defaults,
    timezone=US_EASTERN
)

# File to store job states
JOB_STATES_FILE = Path(os.path.dirname(os.path.abspath(__file__))) / "job_states.json"

def load_job_states():
    """Load job states from the JSON file."""
    if not JOB_STATES_FILE.exists():
        return {}
    
    try:
        with open(JOB_STATES_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        scheduler_logger.error(f"Error loading job states: {e}")
        return {}

def save_job_states(states):
    """Save job states to the JSON file."""
    try:
        with open(JOB_STATES_FILE, 'w') as f:
            json.dump(states, f, indent=2)
    except Exception as e:
        scheduler_logger.error(f"Error saving job states: {e}")

def initialize_scheduler():
    """Initialize and start the scheduler."""
    from app.scheduler.jobs import register_jobs
    
    # Register all jobs with the scheduler
    register_jobs(scheduler)
    
    # Load job states and apply them
    job_states = load_job_states()
    for job_id, enabled in job_states.items():
        job = scheduler.get_job(job_id)
        if job:
            if not enabled:
                scheduler.pause_job(job_id)
                scheduler_logger.info(f"Job {job_id} paused based on saved state")
    
    # Start the scheduler if it's not running
    if not scheduler.running:
        scheduler.start()
        scheduler_logger.info("Task scheduler started")
        
    return scheduler 