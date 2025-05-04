import logging

def run_moving_averages():
    """
    Run the moving averages/statistics update.
    """
    logger = logging.getLogger(__name__)
    try:
        from .moving_averages_impl import main
        main()
        logger.info("Moving averages/statistics update completed successfully.")
        return True
    except Exception as e:
        logger.exception(f"Error running moving averages/statistics update: {e}")
        return False 