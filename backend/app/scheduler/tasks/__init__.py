"""Task implementations for scheduled jobs."""

# Import the overamt task functions for use by the scheduler
from .overamt_task import run_update
from .price_updater_task import update_prices
from .moving_averages_task import run_moving_averages
from .xag_price_task import update_xag_price
from .btc_price_task import update_btc_price
from .rsi_task import update_rsi

# Create the main entry point for the scheduler
def update_overamt():
    """
    Primary entry point for the overamt update task.
    This function is called by the scheduler.
    """
    from datetime import datetime
    import logging
    
    logger = logging.getLogger(__name__)
    
    now = datetime.now()
    logger.info(f"Executing update_overamt task at {now.strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Call the implementation 
        success = run_update()
        
        if success:
            logger.info("update_overamt task completed successfully")
        else:
            logger.error("update_overamt task failed")
            
        return success
    
    except Exception as e:
        logger.exception(f"Error in update_overamt task: {str(e)}")
        return False

def price_updater():
    """
    Primary entry point for the price updater task.
    This function is called by the scheduler.
    """
    from datetime import datetime
    import logging
    
    logger = logging.getLogger(__name__)
    
    now = datetime.now()
    logger.info(f"Executing price_updater task at {now.strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Call the implementation
        success = update_prices()
        
        if success:
            logger.info("price_updater task completed successfully")
        else:
            logger.error("price_updater task failed")
            
        return success
    
    except Exception as e:
        logger.exception(f"Error in price_updater task: {str(e)}")
        return False

def moving_averages_job():
    """
    Entry point for the moving averages/statistics job.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Executing moving_averages_job")
    try:
        success = run_moving_averages()
        if success:
            logger.info("moving_averages_job completed successfully")
        else:
            logger.error("moving_averages_job failed")
        return success
    except Exception as e:
        logger.exception(f"Error in moving_averages_job: {e}")
        return False

def xag_price_job():
    """
    Entry point for the XAG price update job.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Executing xag_price_job")
    try:
        success = update_xag_price()
        if success:
            logger.info("xag_price_job completed successfully")
        else:
            logger.error("xag_price_job failed")
        return success
    except Exception as e:
        logger.exception(f"Error in xag_price_job: {e}")
        return False

def btc_price_job():
    """
    Entry point for the BTC price update job.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Executing btc_price_job")
    try:
        success = update_btc_price()
        if success:
            logger.info("btc_price_job completed successfully")
        else:
            logger.error("btc_price_job failed")
        return success
    except Exception as e:
        logger.exception(f"Error in btc_price_job: {e}")
        return False

def rsi_update_job():
    """
    Entry point for the RSI update job.
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.info("Executing rsi_update_job")
    try:
        success = update_rsi()
        if success:
            logger.info("rsi_update_job completed successfully")
        else:
            logger.error("rsi_update_job failed")
        return success
    except Exception as e:
        logger.exception(f"Error in rsi_update_job: {e}")
        return False
