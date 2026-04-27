import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database settings
    DB_PATH: str
    
    # SEC Database settings
    SEC_DB_PATH: str = "sec_data.db"  # Default to sec_data.db in the same directory as main DB
    
    # Data directory for legacy CSV files (read by moving_averages_task and rsi_task)
    DATA_DIR: str = "/var/www/html/portfolio"  # Default to the original location

    # In-tree directory where the new price-history task writes per-symbol CSVs.
    # Once the legacy download.py cron is retired, point DATA_DIR here too.
    HISTORICAL_DIR: str = "/var/www/mpmv2/backend/data/historical"
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # API Keys
    METAL_PRICE_API_KEY: str = ""  # Metal Price API key for XAG price updates
    
    class Config:
        env_file = ".env"


settings = Settings()
