import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional

class ModelRepository:
    def __init__(self, repo_dir: str = "model_repository"):
        """Initialize the model repository with a directory path."""
        self.repo_dir = repo_dir
        os.makedirs(repo_dir, exist_ok=True)
    
    def save_model_run(self, 
                      parameters: Dict[str, Any], 
                      results: Dict[str, Any], 
                      name: Optional[str] = None,
                      description: Optional[str] = None) -> str:
        """
        Save a model run to the repository.
        Returns the ID of the saved run.
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        run_id = f"run_{timestamp}"
        
        # Clean debug info to remove verbose data
        if 'debug_info' in results and 'config_files' in results['debug_info']:
            results['debug_info']['config_files'].pop('tickers_content', None)
            results['debug_info']['config_files'].pop('sector_mapping', None)
        
        run_data = {
            "id": run_id,
            "timestamp": timestamp,
            "name": name or run_id,
            "description": description,
            "parameters": parameters,
            "results": results
        }
        
        filename = os.path.join(self.repo_dir, f"{run_id}.json")
        with open(filename, 'w') as f:
            json.dump(run_data, f, indent=2)
            
        return run_id
    
    def get_model_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific model run by ID."""
        filename = os.path.join(self.repo_dir, f"{run_id}.json")
        try:
            with open(filename, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            return None
    
    def list_model_runs(self) -> List[Dict[str, Any]]:
        """List all model runs with basic metadata."""
        runs = []
        for filename in os.listdir(self.repo_dir):
            if filename.endswith('.json'):
                with open(os.path.join(self.repo_dir, filename), 'r') as f:
                    run_data = json.load(f)
                    # Include only metadata in listing
                    runs.append({
                        "id": run_data["id"],
                        "name": run_data["name"],
                        "timestamp": run_data["timestamp"],
                        "description": run_data["description"]
                    })
        # Sort by timestamp descending
        return sorted(runs, key=lambda x: x["timestamp"], reverse=True)
    
    def delete_model_run(self, run_id: str) -> bool:
        """Delete a model run. Returns True if successful."""
        filename = os.path.join(self.repo_dir, f"{run_id}.json")
        try:
            os.remove(filename)
            return True
        except FileNotFoundError:
            return False 