#!/usr/bin/env python3
"""
Test script for the BTC price task.
Run this to test the BTC price update functionality.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.scheduler.tasks.btc_price_task import update_btc_price
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

def main():
    print("Testing BTC price update task...")
    
    try:
        success = update_btc_price()
        if success:
            print("✅ BTC price update completed successfully!")
        else:
            print("❌ BTC price update failed!")
            return 1
    except Exception as e:
        print(f"❌ Error testing BTC price update: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main()) 