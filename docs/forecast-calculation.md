# Dividend Forecast Calculation Documentation

## Overview

This document describes the dividend forecast calculation methodology used in the system. The system implements linear regression-based forecasting to predict future dividend payments based on historical data.

## Dividend Forecast Methodology

### Linear Regression Model

The system uses simple linear regression to forecast future dividend payments. The process works as follows:

1. **Data Collection**:
   - Historical dividend data is collected for each symbol
   - For most symbols, 24 months of data is used
   - For symbols with longer histories (`ANGL`, `ASML`, `FPE`, `GILD`, `KMB`, `LKOR`, `MLN`, `REM`, `VMC`), 36 months of data is used

2. **Linear Regression Calculation**:
   - The model fits a straight line to historical dividend data points
   - The linear equation is in the form: `y = mx + b` where:
     - `y` is the predicted dividend amount
     - `x` is the time period
     - `m` is the slope (dividend growth rate)
     - `b` is the y-intercept (base dividend amount)

3. **Statistical Formulas**:
   - Slope (m) = (Σ(xy) - n * x̄ * ȳ) / (Σ(x²) - n * x̄²)
   - Intercept (b) = ȳ - m * x̄
   - Where:
     - x̄ is the mean of x values (time periods)
     - ȳ is the mean of y values (dividend amounts)
     - n is the number of data points
     - Σ is the sum

4. **Forecast Generation**:
   - The system generates forecasts based on payment frequency (monthly or quarterly)
   - For symbols known to pay monthly dividends (`ANGL`, `EMB`, `FPE`, `JPIB`, `LKOR`, `FAGIX`, `FNBGX`, `PGHY`, `SJNK`, `VCSH`), 1-month intervals are used
   - For all other symbols, quarterly (3-month) intervals are used
   - Forecast values are calculated using the formula: `predicted_cost = intercept + (slope * (dividend_count + i * interval))`
   - Negative predictions are adjusted to zero

5. **Output Format**:
   - Forecasts include date, symbol, and predicted cost
   - The system typically displays the last three forecasted entries
   - A complete forecast series is also available for detailed analysis

## Implementation Details

* **API Endpoint**: `/api/dividends/prediction/{symbol}` provides dividend predictions for specific symbols
* **Reference Implementation**: See `divpredict.php` for legacy implementation details
* **Python Implementation**: See `dividend_routes.py` for the current FastAPI implementation

## Limitations and Considerations

1. **Linearity Assumption**: The forecast model assumes a linear relationship between time and dividend amounts, which may not hold for all securities or market conditions.

2. **Historical Data Limitations**: Forecasts are only as good as the historical data they're based on. Symbols with limited history may produce less reliable forecasts.

3. **Market Conditions**: The model does not explicitly account for changing market conditions, economic cycles, or company-specific events.

4. **Negative Predictions**: The system automatically adjusts negative predictions to zero, which may obscure declining trends.

5. **Configuration Dependencies**: Forecast quality depends on proper configuration of payment frequencies and historical data periods for each symbol. 