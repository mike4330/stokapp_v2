from sqlalchemy import create_engine, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings

# Create SQLite URL
SQLALCHEMY_DATABASE_URL = f"sqlite:///{settings.DB_PATH}"

# Create engine with SQLite-specific configuration
# Note: SQLite with StaticPool doesn't support pool_size/max_overflow parameters
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={
        "check_same_thread": False,  # Needed for SQLite
        "timeout": 20  # 20 second timeout for busy database
    },
    # Use StaticPool to maintain a single connection per thread
    poolclass=StaticPool,
    pool_pre_ping=True,  # Verify connections before use
    pool_recycle=3600,  # Recycle connections after 1 hour
    echo=False  # Set to True for SQL debugging (but creates more logs)
)

# Enable WAL mode for SQLite for better concurrency
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    # Enable WAL mode for better concurrency
    cursor.execute("PRAGMA journal_mode=WAL")
    # Set busy timeout (in milliseconds)
    cursor.execute("PRAGMA busy_timeout=20000")  # 20 seconds
    # Enable foreign key constraints
    cursor.execute("PRAGMA foreign_keys=ON")
    # Optimize SQLite for better performance
    cursor.execute("PRAGMA synchronous=NORMAL")  # Less strict sync for better performance
    cursor.execute("PRAGMA cache_size=10000")  # Larger cache
    cursor.execute("PRAGMA temp_store=memory")  # Store temp tables in memory
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
