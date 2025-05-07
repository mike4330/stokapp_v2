from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import logging
from datetime import datetime
import os
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.core.config import settings
from app.api.routes import router as api_router
from app.api.crudroutes import router as crud_router
from app.api.dividend_routes import router as dividend_router
from app.scheduler.config import initialize_scheduler, scheduler, load_job_states, save_job_states
from .mpt_modeling import (
    initiate_mpt_modeling,
    get_task_status,
    save_to_repository,
    list_repository_runs,
    get_repository_run
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("app.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="MPMV2 API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set up static files directory
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
os.makedirs(os.path.join(static_dir, "logos"), exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Include API routers
app.include_router(api_router, prefix="/api")
app.include_router(crud_router, prefix="/api/crud")
app.include_router(dividend_router, prefix="/api")

class OptimizationRequest(BaseModel):
    gamma: Optional[float] = None
    targetReturn: float
    targetRisk: float
    lowerBound: float
    upperBound: float
    objective: str
    refreshData: bool = False
    useSectorConstraints: bool = False
    sectorConstraints: Optional[Dict[str, Dict[str, float]]] = None

class SaveToRepoRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

@app.on_event("startup")
def startup_event():
    """Initialize services on application startup."""
    logger.info("Starting application")
    initialize_scheduler()
    logger.info("Application startup complete")

@app.on_event("shutdown")
def shutdown_event():
    """Clean up resources on application shutdown."""
    logger.info("Shutting down application")
    if scheduler.running:
        scheduler.shutdown()
        logger.info("Scheduler shutdown complete")

@app.get("/")
def read_root():
    return {"message": "Welcome to MPMV2 API", "status": "operational"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/scheduler/status")
def scheduler_status():
    """Get the status of the scheduler and its jobs."""
    if not scheduler.running:
        return {"status": "stopped", "jobs": []}
    
    # Load persisted job states
    job_states = load_job_states()
    
    jobs = []
    for job in scheduler.get_jobs():
        next_run = job.next_run_time.strftime("%Y-%m-%d %H:%M:%S %Z") if job.next_run_time else None
        is_enabled = job.next_run_time is not None
        
        # Check if this job's state is persisted
        is_persisted = job.id in job_states
        persisted_state = job_states.get(job.id, None)
        
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": next_run,
            "enabled": is_enabled,
            "persisted": is_persisted,
            "persisted_state": persisted_state
        })
    
    return {
        "status": "running",
        "jobs": jobs
    }

@app.post("/scheduler/job/{job_id}/pause")
def pause_job(job_id: str):
    """Pause a scheduled job."""
    if not scheduler.running:
        return {"success": False, "message": "Scheduler is not running"}
    
    try:
        job = scheduler.get_job(job_id)
        if not job:
            return {"success": False, "message": f"Job {job_id} not found"}
        
        scheduler.pause_job(job_id)
        
        # Save job state to persist across restarts
        job_states = load_job_states()
        job_states[job_id] = False
        save_job_states(job_states)
        
        logger.info(f"Job {job_id} paused and state persisted")
        return {"success": True, "message": f"Job {job_id} paused successfully"}
    except Exception as e:
        logger.error(f"Error pausing job {job_id}: {str(e)}")
        return {"success": False, "message": str(e)}

@app.post("/scheduler/job/{job_id}/resume")
def resume_job(job_id: str):
    """Resume a paused job."""
    if not scheduler.running:
        return {"success": False, "message": "Scheduler is not running"}
    
    try:
        job = scheduler.get_job(job_id)
        if not job:
            return {"success": False, "message": f"Job {job_id} not found"}
        
        scheduler.resume_job(job_id)
        
        # Save job state to persist across restarts
        job_states = load_job_states()
        job_states[job_id] = True
        save_job_states(job_states)
        
        logger.info(f"Job {job_id} resumed and state persisted")
        return {"success": True, "message": f"Job {job_id} resumed successfully"}
    except Exception as e:
        logger.error(f"Error resuming job {job_id}: {str(e)}")
        return {"success": False, "message": str(e)}

@app.post("/scheduler/job/{job_id}/run-now")
def run_job_now(job_id: str):
    """Manually run a job immediately."""
    if not scheduler.running:
        return {"success": False, "message": "Scheduler is not running"}
    
    try:
        job = scheduler.get_job(job_id)
        if not job:
            return {"success": False, "message": f"Job {job_id} not found"}
        
        # Special case for update_overamt_job
        if job_id == "update_overamt_job":
            from app.scheduler.tasks import update_overamt
            result = update_overamt()
            logger.info(f"Job {job_id} executed manually, result: {result}")
            return {
                "success": True, 
                "message": f"Job {job_id} executed manually",
                "result": result
            }
        else:
            # For other jobs, run them through the scheduler
            scheduler.add_job(
                func=job.func,
                trigger='date',
                id=f"{job_id}_manual_{datetime.now().timestamp()}",
                name=f"{job.name} (Manual Run)",
                replace_existing=False
            )
            logger.info(f"Job {job_id} scheduled for immediate execution")
            return {"success": True, "message": f"Job {job_id} scheduled for immediate execution"}
            
    except Exception as e:
        logger.error(f"Error executing job {job_id}: {str(e)}")
        return {"success": False, "message": str(e)}

@app.post("/api/run-mpt-modeling")
async def run_mpt_modeling(request: OptimizationRequest, background_tasks: BackgroundTasks):
    task_id = initiate_mpt_modeling(background_tasks, request.dict())
    return {"task_id": task_id}

@app.get("/api/task-status/{task_id}")
async def get_task_status_endpoint(task_id: str):
    return get_task_status(task_id)

@app.post("/api/save-to-repository/{task_id}")
async def save_to_repository_endpoint(task_id: str, request: SaveToRepoRequest):
    result = save_to_repository(task_id, request.name, request.description)
    if not result['success']:
        raise HTTPException(status_code=400, detail=result['error'])
    return result

@app.get("/api/repository/runs")
async def list_repository_runs_endpoint():
    result = list_repository_runs()
    if not result['success']:
        raise HTTPException(status_code=500, detail=result['error'])
    return result

@app.get("/api/repository/runs/{run_id}")
async def get_repository_run_endpoint(run_id: str):
    result = get_repository_run(run_id)
    if not result['success']:
        raise HTTPException(status_code=404, detail=result['error'])
    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True
    )
