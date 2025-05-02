from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Create SQLite URL
SQLALCHEMY_DATABASE_URL = f"sqlite:///{settings.DB_PATH}"

# Create engine with connection arguments for better concurrency
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
)

# Enable WAL mode for SQLite for better concurrency
@event.listens_for(engine, "connect")  # Changed from Engine to engine
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    # Enable WAL mode for better concurrency
    cursor.execute("PRAGMA journal_mode=WAL")
    # Set busy timeout (in milliseconds)
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all models
Base = declarative_base()

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
