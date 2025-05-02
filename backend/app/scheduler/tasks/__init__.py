"""Task implementations for scheduled jobs."""

# Import the overamt task functions for use by the scheduler
from .overamt_task import run_update
from .price_updater_task import update_prices

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