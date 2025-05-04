import pandas as pd
import numpy as np
from datetime import date, timedelta, datetime
import yfinance as yf
from pypfopt.efficient_frontier import EfficientFrontier
from pypfopt.expected_returns import mean_historical_return
from pypfopt.risk_models import CovarianceShrinkage
from pypfopt import objective_functions
import requests_cache
import os
import csv
import logging
from logging.handlers import RotatingFileHandler
from typing import Dict, List, Tuple, Optional

# Configure logging
def setup_logger():
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)
    
    # Create logs directory if it doesn't exist
    log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logs')
    os.makedirs(log_dir, exist_ok=True)
    
    # Create formatters and handlers
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # Rotating file handler (10MB per file, keep 5 backup files)
    file_handler = RotatingFileHandler(
        os.path.join(log_dir, 'portfolio_optimization.log'),
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setFormatter(formatter)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    
    # Add handlers to logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

# Initialize logger
logger = setup_logger()

# Set up caching for API requests
session = requests_cache.CachedSession("yfinance.cache")

def handle_price_data_nans(prices: pd.DataFrame, nan_threshold: float = 0.2) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Handle NaN values in price data while keeping maximum usable data.
    
    Args:
        prices: DataFrame with price data
        nan_threshold: Maximum allowable fraction of NaN values per ticker (default 0.2 or 20%)
        
    Returns:
        Tuple of (cleaned_prices, nan_counts)
    """
    # Count NaNs per column
    nan_counts = prices.isna().sum()
    total_rows = len(prices)
    
    # Log NaN statistics for each ticker
    problematic_tickers = []
    for ticker, nan_count in nan_counts.items():
        if nan_count > 0:
            nan_fraction = nan_count / total_rows
            message = f"Found {nan_count} NaN values ({nan_fraction:.1%}) for {ticker}"
            if nan_fraction > nan_threshold:
                logger.warning(message + " - Consider removing this ticker")
                problematic_tickers.append(ticker)
            else:
                logger.info(message)
    
    # Drop rows where all values are NaN (same as legacy code)
    cleaned_prices = prices.dropna(how='all')
    
    # Log how many rows were dropped
    dropped_rows = len(prices) - len(cleaned_prices)
    if dropped_rows > 0:
        logger.info(f"Dropped {dropped_rows} rows where all values were NaN")
    
    return cleaned_prices, dict(nan_counts)

def run_optimization(gamma, target_return, target_risk, lower_bound, upper_bound, objective='efficient_return', refresh_data=False, sector_constraints=None):
    """
    Run portfolio optimization based on provided parameters.
    Returns the optimized weights and performance metrics.
    
    Args:
        gamma: L2 regularization parameter (not used for max_sharpe)
        target_return: Target return for the portfolio (used for efficient_return)
        target_risk: Target risk for the portfolio (used for efficient_risk)
        lower_bound: Lower bound for individual asset weights
        upper_bound: Upper bound for individual asset weights
        objective: Optimization objective ('max_sharpe', 'min_volatility', 'efficient_risk', 'efficient_return')
        refresh_data: Whether to refresh price data from Yahoo Finance
        sector_constraints: Dictionary containing sector constraints
    """
    debug_info = {
        'config_files': {
            'status': 'checking',
            'tickers_file': '',
            'sectormap_file': '',
            'tickers_count': 0,
            'sectors_count': 0,
            'tickers_content': None,
            'sector_mapping': None
        },
        'optimization': {
            'status': 'initializing',
            'message': '',
            'data_shape': None,
            'constraints': {},
            'solver_status': None,
            'data_info': {
                'missing_tickers': [],
                'price_range': None,
                'nan_counts': None
            }
        }
    }

    try:
        logger.info("Starting optimization run with parameters:")
        logger.info(f"gamma: {gamma}, target_return: {target_return}")
        logger.info(f"target_risk: {target_risk}")
        logger.info(f"bounds: [{lower_bound}, {upper_bound}]")
        logger.info(f"refresh_data: {refresh_data}")

        # Load tickers and sector mapping from configuration files
        config_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'config')
        tickers_file = os.path.join(config_dir, 'tickers.txt')
        sectormap_file = os.path.join(config_dir, 'sectormap.txt')
        
        logger.info(f"Looking for config files in: {config_dir}")
        logger.info(f"Tickers file: {tickers_file}")
        logger.info(f"Sector map file: {sectormap_file}")
        
        if not os.path.exists(tickers_file) or not os.path.exists(sectormap_file):
            error_msg = f"Configuration files not found in {config_dir}. Please ensure tickers.txt and sectormap.txt are present."
            logger.error(error_msg)
            debug_info['config_files']['status'] = 'error'
            debug_info['config_files']['error'] = error_msg
            raise FileNotFoundError(error_msg)
        
        debug_info['config_files']['tickers_file'] = tickers_file
        debug_info['config_files']['sectormap_file'] = sectormap_file
        
        # Load and validate tickers
        with open(tickers_file, "r") as f:
            tickers = [line.strip() for line in f if not line.startswith("#") and line.strip()]
            debug_info['config_files']['tickers_count'] = len(tickers)
            debug_info['config_files']['tickers_content'] = tickers
            logger.info(f"Loaded {len(tickers)} tickers from file")
            logger.info(f"First few tickers: {tickers[:5]}")
        
        # Load and validate sector mapping
        with open(sectormap_file, "r") as f:
            sector_mapper = dict(line.strip().split(",") for line in f if line.strip())
            debug_info['config_files']['sectors_count'] = len(sector_mapper)
            debug_info['config_files']['sector_mapping'] = sector_mapper
            logger.info(f"Loaded {len(sector_mapper)} sector mappings")
            logger.info(f"Unique sectors: {set(sector_mapper.values())}")
        
        # Validate sector mapping covers all tickers
        unmapped_tickers = [t for t in tickers if t not in sector_mapper]
        if unmapped_tickers:
            logger.warning(f"Found {len(unmapped_tickers)} unmapped tickers: {unmapped_tickers}")
            debug_info['optimization']['data_info']['unmapped_tickers'] = unmapped_tickers
        
        debug_info['config_files']['status'] = 'success'
        debug_info['config_files']['message'] = f"Successfully loaded {len(tickers)} tickers and {len(sector_mapper)} sector mappings"

        # Process sector constraints
        if sector_constraints:
            logger.info("Received sector constraints from UI:")
            for sector, constraints in sector_constraints.items():
                logger.info(f"  {sector}: min={constraints['min']:.4f}, max={constraints['max']:.4f}")
            
            sector_lower = {sector: constraints['min'] for sector, constraints in sector_constraints.items()}
            sector_upper = {sector: constraints['max'] for sector, constraints in sector_constraints.items()}
            logger.info("Using provided sector constraints")
        else:
            logger.info("No sector constraints provided, using defaults")
            # Use default constraints
            bonds_total = 0.325
            dbonds_lower = bonds_total * 0.695
            fbonds_lower = bonds_total * 0.305
            dbonds_upper = dbonds_lower + 0.01
            fbonds_upper = fbonds_lower + 0.01

            sector_lower = {
                "DBonds": dbonds_lower,
                "FBonds": fbonds_lower,
                "Commodities": 0.025,
                "Misc": 0.0125,
                "Communication Services": 0.0531,
                "Consumer Discretionary": 0.0534,
                "Consumer Staples": 0.0534,
                "Energy": 0.0438,
                "Financials": 0.0534,
                "Healthcare": 0.0534,
                "Industrials": 0.0534,
                "Materials": 0.0534,
                "Tech": 0.0674,
                "Real Estate": 0.0534,
                "Precious Metals": 0.05,
                "Utilities": 0.0494,
            }

            sector_upper = {
                "DBonds": dbonds_upper,
                "FBonds": fbonds_upper,
                "Commodities": 0.063,
                "Communication Services": 0.063,
                "Consumer Discretionary": 0.063,
                "Consumer Staples": 0.063,
                "Energy": 0.063,
                "Financials": 0.063,
                "Healthcare": 0.08,
                "Industrials": 0.063,
                "Materials": 0.063,
                "Real Estate": 0.063,
                "Tech": 0.20,
                "Utilities": 0.063,
            }
            logger.info("Default sector constraints:")
            for sector in sector_lower.keys():
                logger.info(f"  {sector}: min={sector_lower[sector]:.4f}, max={sector_upper.get(sector, 0.063):.4f}")

        # Validate all sectors in mapping have constraints
        missing_sectors = set(sector_mapper.values()) - set(sector_lower.keys())
        if missing_sectors:
            logger.error(f"Missing constraints for sectors: {missing_sectors}")
            debug_info['optimization']['data_info']['missing_sector_constraints'] = list(missing_sectors)

        # Check for sectors in constraints that aren't in the mapping
        extra_sectors = set(sector_lower.keys()) - set(sector_mapper.values())
        if extra_sectors:
            logger.warning(f"Found constraints for sectors not in mapping: {extra_sectors}")
            debug_info['optimization']['data_info']['extra_sector_constraints'] = list(extra_sectors)

        # Validate constraint values
        for sector in sector_lower.keys():
            min_val = sector_lower[sector]
            max_val = sector_upper.get(sector, 0.063)
            if min_val > max_val:
                logger.error(f"Invalid constraints for {sector}: min ({min_val:.4f}) > max ({max_val:.4f})")
            if min_val < 0:
                logger.error(f"Invalid minimum constraint for {sector}: {min_val:.4f} < 0")
            if max_val > 1:
                logger.error(f"Invalid maximum constraint for {sector}: {max_val:.4f} > 1")

        # Log total allocation bounds
        total_min = sum(sector_lower.values())
        total_max = sum(sector_upper.values())
        logger.info(f"Total allocation bounds: min={total_min:.4f}, max={total_max:.4f}")
        if abs(total_min - 1) > 0.0001:  # Allow small floating point differences
            logger.warning(f"Total minimum allocation ({total_min:.4f}) != 1.0")
        if abs(total_max - 1) > 0.1:  # Allow some flexibility in maximum
            logger.warning(f"Total maximum allocation ({total_max:.4f}) significantly differs from 1.0")

        # Add sector constraints to debug info
        debug_info['optimization']['constraints'].update({
            'sector_constraints': sector_constraints if sector_constraints else {
                sector: {'min': sector_lower[sector], 'max': sector_upper.get(sector, 0.063)}
                for sector in sector_lower.keys()
            }
        })

        # Update optimization debug info with other constraints
        debug_info['optimization']['constraints'].update({
            'gamma': gamma,
            'target_return': target_return,
            'target_risk': target_risk,
            'lower_bound': lower_bound,
            'upper_bound': upper_bound,
            'refresh_data': refresh_data,
            'total_allocation_bounds': {
                'min': total_min,
                'max': total_max
            }
        })

        # Calculate date range for historical data
        today = date.today()
        ten_years_ago = today - timedelta(days=365 * 10)

        debug_info['optimization']['status'] = 'loading_data'
        if refresh_data:
            logger.info("Downloading fresh data from Yahoo Finance...")
            debug_info['optimization']['message'] = 'Downloading fresh data from Yahoo Finance...'
            ohlc = yf.download(tickers, start=ten_years_ago, end=today, session=session)
            prices = ohlc["Close"].dropna(how="all")
            prices.to_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pricedataset.csv'), index=True)
        else:
            logger.info("Attempting to load data from cache...")
            debug_info['optimization']['message'] = 'Loading data from cache...'
            try:
                prices = pd.read_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pricedataset.csv'), parse_dates=True, index_col="Date")
                prices = prices[prices.columns.intersection(tickers)]
                
                # Add diagnostic logging
                logger.info("Initial data shape after loading CSV: %s", prices.shape)
                initial_nan_counts = prices.isna().sum()
                if initial_nan_counts.any():
                    logger.info("NaN counts right after CSV load:")
                    for col in initial_nan_counts.index:
                        if initial_nan_counts[col] > 0:
                            logger.info(f"  {col}: {initial_nan_counts[col]} NaNs ({initial_nan_counts[col]/len(prices):.1%})")
                    logger.info("First few rows with NaN:")
                    nan_rows = prices[prices.isna().any(axis=1)].head()
                    logger.info("\n" + str(nan_rows))
                
                # Continue with NaN handling
                prices, nan_counts = handle_price_data_nans(prices)
            except FileNotFoundError:
                logger.info("Cache not found, downloading from Yahoo Finance...")
                debug_info['optimization']['message'] = 'Cache not found, downloading from Yahoo Finance...'
                ohlc = yf.download(tickers, start=ten_years_ago, end=today, session=session)
                prices = ohlc["Close"].dropna(how="all")
                prices.to_csv(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pricedataset.csv'), index=True)

        # Validate price data
        missing_tickers = set(tickers) - set(prices.columns)
        if missing_tickers:
            logger.warning(f"Missing price data for tickers: {missing_tickers}")
            debug_info['optimization']['data_info']['missing_tickers'] = list(missing_tickers)

        debug_info['optimization']['data_shape'] = f"Loaded price data shape: {prices.shape[0]} days × {prices.shape[1]} assets"
        debug_info['optimization']['data_info']['price_range'] = {
            'start': prices.index.min().strftime('%Y-%m-%d'),
            'end': prices.index.max().strftime('%Y-%m-%d')
        }
        
        logger.info(f"Price data shape: {prices.shape}")
        logger.info(f"Date range: {prices.index.min()} to {prices.index.max()}")

        debug_info['optimization']['status'] = 'calculating_parameters'
        debug_info['optimization']['message'] = 'Calculating expected returns and covariance...'

        # Calculate expected returns and covariance matrix
        mu = mean_historical_return(prices)
        S = CovarianceShrinkage(prices).ledoit_wolf()

        logger.info("Expected returns statistics:")
        logger.info(f"Mean: {mu.mean():.4f}, Min: {mu.min():.4f}, Max: {mu.max():.4f}")

        debug_info['optimization']['status'] = 'optimizing'
        debug_info['optimization']['message'] = 'Running optimization...'

        ef = EfficientFrontier(mu, S, weight_bounds=(lower_bound, upper_bound), verbose=True)
        
        try:
            # Only apply L2 regularization for methods other than max_sharpe
            if objective != 'max_sharpe' and gamma is not None:
                logger.info(f"Applying L2 regularization with gamma={gamma}")
                ef.add_objective(objective_functions.L2_reg, gamma=gamma)
            
            # Apply sector constraints if provided
            if sector_constraints is not None:
                logger.info("Applying sector constraints")
                ef.add_sector_constraints(sector_mapper, sector_lower, sector_upper)
            else:
                logger.info("No sector constraints applied")
            
            # Run optimization based on objective
            if objective == 'max_sharpe':
                logger.info("Running maximum Sharpe ratio optimization")
                weights = ef.max_sharpe()
            elif objective == 'min_volatility':
                logger.info("Running minimum volatility optimization")
                weights = ef.min_volatility()
            elif objective == 'efficient_risk':
                logger.info(f"Running efficient risk optimization with target volatility {target_risk}")
                weights = ef.efficient_risk(target_risk)
            else:  # efficient_return
                logger.info(f"Running efficient return optimization with target return {target_return}")
                weights = ef.efficient_return(target_return)
            
            debug_info['optimization']['status'] = 'success'
            debug_info['optimization']['message'] = f'Optimization completed successfully using {objective} method'
            debug_info['optimization']['solver_status'] = 'optimal'

            # Calculate performance metrics
            expected_return, volatility, sharpe_ratio = ef.portfolio_performance(verbose=False)
            expected_return = round(expected_return, 6)
            sharpe_ratio = round(sharpe_ratio, 6)

            logger.info("Optimization successful")
            logger.info(f"Expected return: {expected_return:.4f}")
            logger.info(f"Volatility: {volatility:.4f}")
            logger.info(f"Sharpe ratio: {sharpe_ratio:.4f}")

            # Format output
            output = {
                'weights': weights,
                'expected_return': expected_return,
                'volatility': volatility,
                'sharpe_ratio': sharpe_ratio,
                'sector_weights': {},
                'debug_info': debug_info
            }

            # Calculate total weight per sector
            for sector in set(sector_mapper.values()):
                total_weight = 0
                for t, w in weights.items():
                    if sector_mapper.get(t) == sector:
                        total_weight += w
                output['sector_weights'][sector] = round(total_weight, 3)

            logger.info("Sector weights:")
            for sector, weight in output['sector_weights'].items():
                logger.info(f"{sector}: {weight:.3f}")

            return output

        except Exception as e:
            logger.error(f"Optimization failed: {str(e)}")
            debug_info['optimization']['status'] = 'error'
            debug_info['optimization']['message'] = str(e)
            debug_info['optimization']['solver_status'] = 'infeasible'
            raise Exception(f"Optimization failed: {str(e)}")

    except Exception as e:
        logger.error(f"Error in optimization process: {str(e)}")
        debug_info['optimization']['status'] = 'error'
        debug_info['optimization']['message'] = str(e)
        raise 