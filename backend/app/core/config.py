import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database settings
    DB_PATH: str
    
    # SEC Database settings
    SEC_DB_PATH: str = "sec_data.db"  # Default to sec_data.db in the same directory as main DB
    
    # Data directory for CSV files
    DATA_DIR: str = "/var/www/html/portfolio"  # Default to the original location
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # API Keys
    METAL_PRICE_API_KEY: str = ""  # Metal Price API key for XAG price updates
    
    class Config:
        env_file = ".env"


settings = Settings()
