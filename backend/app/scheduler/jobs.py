"""Scheduler jobs module."""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

from app.scheduler.config import MARKET_OPEN_HOUR, MARKET_CLOSE_HOUR, US_EASTERN
# Import directly from the module file
import app.scheduler.tasks as tasks_module

# Configure logging
logger = logging.getLogger(__name__)

def register_jobs(scheduler: BackgroundScheduler):
    """Register all scheduled jobs with the scheduler."""
    # Register the update_overamt job to run every 5 minutes during US market hours on weekdays only
    scheduler.add_job(
        func=tasks_module.update_overamt,  # Access function through the module
        trigger=CronTrigger(
            day_of_week="mon-fri",  # Monday through Friday only
            hour=f"{MARKET_OPEN_HOUR}-{MARKET_CLOSE_HOUR}",  # Between market open and close
            minute="*/5",  # Every 5 minutes
            timezone=US_EASTERN
        ),
        id="update_overamt_job",
        name="Update Overamt Values",
        replace_existing=True
    )
    
    logger.info(f"Registered job: update_overamt (runs every 5 minutes during market hours {MARKET_OPEN_HOUR}:00-{MARKET_CLOSE_HOUR}:00 ET, weekdays only)")
    
    # Register the price updater job to run once daily at 9:35 AM ET on weekdays only
    scheduler.add_job(
        func=tasks_module.price_updater,  # Access function through the module
        trigger=CronTrigger(
            day_of_week="mon-fri",  # Monday through Friday only
            hour="9",  # 9 AM
            minute="35",  # At minute 35
            timezone=US_EASTERN
        ),
        id="price_updater_job",
        name="Update Stock Prices",
        replace_existing=True
    )
    
    logger.info(f"Registered job: price_updater (runs daily at 9:35 AM ET, weekdays only)")
    
    # Register the moving averages job to run daily at 10:00 AM ET on weekdays only
    scheduler.add_job(
        func=tasks_module.moving_averages_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",  # Monday through Friday only
            hour="17",  # 10 AM
            minute="5",  # At minute 0
            timezone=US_EASTERN
        ),
        id="moving_averages_job",
        name="Update Moving Averages and Stats",
        replace_existing=True
    )
    logger.info("Registered job: moving_averages_job (runs daily at 10:00 AM ET, weekdays only)")
    
    # Add additional jobs here as needed 