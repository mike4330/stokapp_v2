import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database settings
    DB_PATH: str
    
    # Server settings
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    class Config:
        env_file = ".env"


settings = Settings()
