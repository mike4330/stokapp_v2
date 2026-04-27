"""Scheduler jobs module."""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging
from datetime import datetime

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

    # Register the XAG price update job to run at 15:30 ET on weekdays only
    scheduler.add_job(
        func=tasks_module.xag_price_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",  # Monday through Friday only
            hour="15",  # 3 PM
            minute="30",  # At minute 30
            timezone=US_EASTERN
        ),
        id="xag_price_job",
        name="Update XAG (Silver) Price",
        replace_existing=True
    )
    logger.info("Registered job: xag_price_job (runs daily at 3:30 PM ET, weekdays only)")
    
    # Register the BTC price update job to run every hour on weekdays only
    scheduler.add_job(
        func=tasks_module.btc_price_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",  # Monday through Friday only
            hour="*",  # Every hour
            minute="0",  # At minute 0
            timezone=US_EASTERN
        ),
        id="btc_price_job",
        name="Update BTC-USD Price and Moving Averages (BTC)",
        replace_existing=True
    )
    logger.info("Registered job: btc_price_job (runs every hour on the hour, weekdays only)")

    # Register the RSI update job to run weekdays at 16:40 ET (after legacy
    # download.py finishes at 16:28). Reads per-symbol CSVs from settings.DATA_DIR
    # and writes MPT.RSI.
    scheduler.add_job(
        func=tasks_module.rsi_update_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="16",
            minute="40",
            timezone=US_EASTERN
        ),
        id="rsi_update_job",
        name="Update RSI from CSVs (16:40 ET)",
        replace_existing=True
    )
    logger.info("Registered job: rsi_update_job (runs daily at 4:40 PM ET, weekdays only)")

    # Register the S&P 500 sector P/E scraper to run weekdays at 17:30 ET.
    # Sector P/Es from worldperatio.com don't move fast — daily after-close
    # is plenty. Will eventually fold into a metadata-refresh pipeline.
    scheduler.add_job(
        func=tasks_module.sector_pe_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="17",
            minute="30",
            timezone=US_EASTERN
        ),
        id="sector_pe_job",
        name="Update S&P 500 Sector P/E (17:30 ET)",
        replace_existing=True
    )
    logger.info("Registered job: sector_pe_job (runs daily at 5:30 PM ET, weekdays only)")

    # Register the 10-year price history downloader to run weekdays at 16:28 ET.
    # Matches the legacy /var/www/html/portfolio/download.py cron schedule.
    # Writes per-symbol CSVs to settings.HISTORICAL_DIR (in-tree), feeding
    # rsi_update_job (16:40) and moving_averages_job once DATA_DIR is flipped.
    scheduler.add_job(
        func=tasks_module.price_history_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="16",
            minute="28",
            timezone=US_EASTERN
        ),
        id="price_history_job",
        name="Download 10y Price History (16:28 ET)",
        replace_existing=True
    )
    logger.info("Registered job: price_history_job (runs daily at 4:28 PM ET, weekdays only)")

    # Register the daily security_values snapshot job at weekdays 16:31 ET
    # (matches the legacy hist2.sh cron). One row per held symbol per day with
    # close, shares, cost_basis, cum_divs, cbps, cum_real_gl. Idempotent.
    scheduler.add_job(
        func=tasks_module.security_values_snapshot_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="16",
            minute="31",
            timezone=US_EASTERN
        ),
        id="security_values_snapshot_job",
        name="Snapshot security_values (16:31 ET)",
        replace_existing=True
    )
    logger.info("Registered job: security_values_snapshot_job (runs daily at 4:31 PM ET, weekdays only)")

    # Register the daily portfolio aggregate snapshot at weekdays 16:21 ET
    # (matches legacy portstats2.php cron). Inserts one row to `historical`
    # per day with portfolio totals + WMA/YMA averages of past returns.
    scheduler.add_job(
        func=tasks_module.portfolio_stats_job,
        trigger=CronTrigger(
            day_of_week="mon-fri",
            hour="16",
            minute="21",
            timezone=US_EASTERN
        ),
        id="portfolio_stats_job",
        name="Portfolio Stats / historical (16:21 ET)",
        replace_existing=True
    )
    logger.info("Registered job: portfolio_stats_job (runs daily at 4:21 PM ET, weekdays only)")

    # Add additional jobs here as needed