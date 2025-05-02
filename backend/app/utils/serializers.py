from sqlalchemy import inspect
from typing import Any, Dict, List, TypeVar, Union
from decimal import Decimal

T = TypeVar('T')

# Columns to skip during serialization
SKIP_COLUMNS = ['class']

def sqlalchemy_to_dict(obj: Any) -> Dict[str, Any]:
    """Convert SQLAlchemy object to a dictionary."""
    if obj is None:
        return None
    
    result = {}
    for key in obj.__table__.columns.keys():
        # Skip columns that are causing issues
        if key in SKIP_COLUMNS:
            continue
            
        # Handle the 'return' column specially
        if key == 'return':
            result[key] = getattr(obj, 'return_')
            continue
            
        # Normal case
        value = getattr(obj, key)
        
        # Handle special types that aren't JSON serializable
        if isinstance(value, Decimal):
            value = float(value)
        result[key] = value
    return result

def row_to_dict(row: Any) -> Dict[str, Any]:
    """Convert SQLAlchemy Row object to dictionary."""
    try:
        # For SQL Alchemy 2.0+ Row objects
        result = dict(row._mapping)
    except (AttributeError, TypeError):
        try:
            # For older SQLAlchemy versions
            result = dict(row)
        except (AttributeError, TypeError):
            # Fall back to manually extracting data
            result = {}
            for column, value in row.items():
                result[column] = value
    
    # Remove skipped columns and convert Decimal to float
    final_result = {}
    for key, value in result.items():
        if key in SKIP_COLUMNS:
            continue
        if isinstance(value, Decimal):
            value = float(value)
        final_result[key] = value
            
    return final_result

def convert_to_dict(obj: Union[T, List[T]]) -> Union[Dict[str, Any], List[Dict[str, Any]]]:
    """Generic function to convert SQLAlchemy objects or lists of objects to dicts."""
    if obj is None:
        return None
    
    # Handle lists
    if isinstance(obj, list):
        return [convert_to_dict(item) for item in obj]
    
    # Check if it's already a dict
    if isinstance(obj, dict):
        return obj
    
    # Check if it's a SQLAlchemy model
    if hasattr(obj, '__table__'):
        return sqlalchemy_to_dict(obj)
    
    # Check if it's a Row object
    try:
        return row_to_dict(obj)
    except (AttributeError, TypeError):
        pass
    
    # If we can't convert it, just return it as is
    return obj
