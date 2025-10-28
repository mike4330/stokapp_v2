#!/usr/bin/env python3
"""
Monitor file handles used by uvicorn processes.

This script helps monitor the file handle usage of the MPMV2 backend
to ensure the fixes are working properly.
"""
import subprocess
import sys
import os


def get_uvicorn_pids():
    """Get all uvicorn process PIDs."""
    try:
        result = subprocess.run(['pgrep', '-f', 'uvicorn'], capture_output=True, text=True)
        if result.returncode == 0:
            return [int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()]
        return []
    except Exception as e:
        print(f"Error getting uvicorn PIDs: {e}")
        return []


def count_file_handles(pid):
    """Count file handles for a given PID."""
    try:
        result = subprocess.run(['lsof', '-p', str(pid)], capture_output=True, text=True)
        if result.returncode == 0:
            lines = result.stdout.strip().split('\n')
            return len(lines) - 1  # Subtract header line
        return 0
    except Exception as e:
        print(f"Error counting handles for PID {pid}: {e}")
        return 0


def get_log_handles(pid):
    """Get log file handles for a given PID."""
    try:
        result = subprocess.run(['lsof', '-p', str(pid)], capture_output=True, text=True)
        if result.returncode == 0:
            log_handles = []
            for line in result.stdout.split('\n'):
                if '.log' in line:
                    log_handles.append(line.strip())
            return log_handles
        return []
    except Exception as e:
        print(f"Error getting log handles for PID {pid}: {e}")
        return []


def get_sqlite_handles(pid):
    """Get SQLite file handles for a given PID."""
    try:
        result = subprocess.run(['lsof', '-p', str(pid)], capture_output=True, text=True)
        if result.returncode == 0:
            sqlite_handles = []
            for line in result.stdout.split('\n'):
                if '.sqlite' in line or 'portfolio.sqlite' in line:
                    sqlite_handles.append(line.strip())
            return sqlite_handles
        return []
    except Exception as e:
        print(f"Error getting SQLite handles for PID {pid}: {e}")
        return []


def main():
    """Main monitoring function."""
    pids = get_uvicorn_pids()
    
    if not pids:
        print("No uvicorn processes found.")
        return
    
    print(f"Found {len(pids)} uvicorn process(es)")
    print("=" * 60)
    
    total_handles = 0
    total_log_handles = 0
    total_sqlite_handles = 0
    
    for pid in pids:
        handles = count_file_handles(pid)
        log_handles = get_log_handles(pid)
        sqlite_handles = get_sqlite_handles(pid)
        
        print(f"PID {pid}:")
        print(f"  Total file handles: {handles}")
        print(f"  Log file handles: {len(log_handles)}")
        print(f"  SQLite file handles: {len(sqlite_handles)}")
        
        if log_handles:
            print("  Log files:")
            for handle in log_handles[:5]:  # Show first 5
                print(f"    {handle}")
            if len(log_handles) > 5:
                print(f"    ... and {len(log_handles) - 5} more")
        
        if sqlite_handles:
            print("  SQLite files:")
            for handle in sqlite_handles[:5]:  # Show first 5
                print(f"    {handle}")
            if len(sqlite_handles) > 5:
                print(f"    ... and {len(sqlite_handles) - 5} more")
        
        print()
        
        total_handles += handles
        total_log_handles += len(log_handles)
        total_sqlite_handles += len(sqlite_handles)
    
    print("=" * 60)
    print(f"TOTALS:")
    print(f"  Total file handles: {total_handles}")
    print(f"  Total log handles: {total_log_handles}")
    print(f"  Total SQLite handles: {total_sqlite_handles}")
    
    # Warning thresholds
    if total_handles > 1000:
        print("⚠️  WARNING: High number of file handles detected!")
    if total_log_handles > 10:
        print("⚠️  WARNING: Too many log file handles - possible logging issue!")
    if total_sqlite_handles > 20:
        print("⚠️  WARNING: Too many SQLite handles - possible connection pooling issue!")


if __name__ == "__main__":
    main() 