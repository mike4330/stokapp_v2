import subprocess
import os
import uuid
import json
from fastapi import BackgroundTasks
from typing import Dict, Any, Optional
from .portfolio_optimization import run_optimization
from .model_repository import ModelRepository

# Get the absolute path for model repository
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
repo_path = os.path.join(base_dir, "model_repository")

# Initialize model repository with absolute path
model_repo = ModelRepository(repo_dir=repo_path)

# In-memory storage for task status and results (for simplicity)
# In a production environment, consider using SQLite or Redis
task_storage: Dict[str, Dict[str, Any]] = {}

def run_mpt_modeling_task(task_id: str, params: Dict[str, Any]):
    """
    Background task to run the MPT modeling using the portfolio_optimization module.
    Updates task status and stores results.
    """
    try:
        task_storage[task_id] = {'status': 'running', 'result': None, 'error': None}
        
        # Extract parameters
        objective = params.get('objective', 'efficient_return')
        gamma = float(params.get('gamma')) if params.get('gamma') is not None else None
        target_return = float(params.get('targetReturn', 0.07))
        target_risk = float(params.get('targetRisk', 0.1286))
        lower_bound = float(params.get('lowerBound', 0.00131))
        upper_bound = float(params.get('upperBound', 0.0482))
        refresh_data = params.get('refreshData', False)
        use_sector_constraints = params.get('useSectorConstraints', False)
        sector_constraints = params.get('sectorConstraints') if use_sector_constraints else None
        
        # Run optimization
        result = run_optimization(
            gamma=gamma,
            target_return=target_return,
            target_risk=target_risk,
            lower_bound=lower_bound,
            upper_bound=upper_bound,
            objective=objective,
            refresh_data=refresh_data,
            sector_constraints=sector_constraints
        )
        
        task_storage[task_id]['status'] = 'completed'
        task_storage[task_id]['result'] = result
    except Exception as e:
        task_storage[task_id]['status'] = 'failed'
        task_storage[task_id]['error'] = str(e)

def initiate_mpt_modeling(background_tasks: BackgroundTasks, params: Dict[str, Any]) -> str:
    """
    Initiate an MPT modeling task and return the task ID for status polling.
    """
    task_id = str(uuid.uuid4())
    background_tasks.add_task(run_mpt_modeling_task, task_id, params)
    return task_id

def get_task_status(task_id: str) -> Dict[str, Any]:
    """
    Retrieve the status and result of a task by ID.
    """
    return task_storage.get(task_id, {'status': 'not_found', 'result': None, 'error': 'Task not found'})

def save_to_repository(task_id: str, name: Optional[str] = None, description: Optional[str] = None) -> Dict[str, Any]:
    """
    Save a completed model run to the repository.
    """
    task_data = task_storage.get(task_id)
    if not task_data or task_data['status'] != 'completed':
        return {
            'success': False,
            'error': 'Task not found or not completed'
        }

    try:
        # Get the original parameters from the task result
        parameters = dict(task_data['result']['debug_info']['optimization']['constraints'])
        # Remove target_return if objective is efficient_risk
        objective = parameters.get('objective')
        if not objective:
            # Try to infer from debug_info message
            debug_message = task_data['result']['debug_info']['optimization'].get('message', '')
            if 'efficient risk' in debug_message.lower():
                objective = 'efficient_risk'
        if objective == 'efficient_risk' and 'target_return' in parameters:
            parameters.pop('target_return')

        # Save to repository
        run_id = model_repo.save_model_run(
            parameters=parameters,
            results=task_data['result'],
            name=name,
            description=description
        )

        return {
            'success': True,
            'run_id': run_id
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def list_repository_runs() -> Dict[str, Any]:
    """
    List all runs in the repository.
    """
    try:
        runs = model_repo.list_model_runs()
        return {
            'success': True,
            'runs': runs
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        }

def get_repository_run(run_id: str) -> Dict[str, Any]:
    """
    Get a specific run from the repository.
    """
    try:
        run = model_repo.get_model_run(run_id)
        if run:
            return {
                'success': True,
                'run': run
            }
        else:
            return {
                'success': False,
                'error': 'Run not found'
            }
    except Exception as e:
        return {
            'success': False,
            'error': str(e)
        } 