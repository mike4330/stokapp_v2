"""
Run script for the portfolio tracker backend.
"""
import uvicorn

if __name__ == "__main__":
    # Start the FastAPI application
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    ) 