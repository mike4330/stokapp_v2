# Cursor AI Assistant Rules for MPMv2 Project

## Backend Testing

If you need to test the backend separately from the main application:

### Starting Backend for Testing
```bash
cd /var/www/mpmv2/backend
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

### Notes
- Main application runs on port 8000
- Use port 8001 for testing to avoid conflicts
- The backend directory contains the FastAPI application
- Hot reload is enabled for development

## Project Structure
- `/backend/` - FastAPI backend application
- `/frontend/` - React frontend application
- Production servers run on port 8000 (backend) and are served via nginx 

# Frontend Date Handling Rules
- For date-only strings (YYYY-MM-DD format) from the database:
  - PREFER using the date string as-is without parsing when possible
  - AVOID new Date(dateString) as this causes timezone shifts
  - If parsing is required, use local date parsing:
    const [year, month, day] = dateString.split('-').map(Number);
    new Date(year, month - 1, day);
- This app does not need timezone handling - keep dates simple 