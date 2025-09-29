"""
Run script for the portfolio tracker backend.
"""
import uvicorn
import os

if __name__ == "__main__":
    # Check if we're in production
    is_production = os.getenv("PRODUCTION", "false").lower() == "true"
    
    # Start the FastAPI application
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=not is_production,  # Disable reload in production
        log_level="info",
        # Limit workers in development to reduce resource usage
        workers=1 if not is_production else None
    ) 