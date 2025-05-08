from datetime import datetime
from sqlalchemy.sql import text
from typing import Dict, List, Tuple


class DividendAnalysisService:
    def __init__(self, db_session):
        self.db = db_session
    
    def detect_payment_frequency(self, symbol: str) -> Dict:
        """
        Analyzes historical dividend payments to determine if a symbol pays monthly or quarterly.
        
        Args:
            symbol: The stock symbol to analyze
        
        Returns:
            Dict with payment frequency details
        """
        # Get the last 3 years of dividend data for better pattern detection
        query = text("""
            SELECT substr(date_new, 0, 11) as payment_date, symbol, price, units
            FROM transactions 
            WHERE symbol = :symbol 
            AND date_new >= Date('now', '-36 months')
            AND xtype = 'Div' 
            ORDER BY date_new
        """)
        
        result = self.db.execute(query, {"symbol": symbol}).fetchall()
        
        # Need at least 3 payments to determine a pattern
        if len(result) < 3:
            return {
                "symbol": symbol,
                "frequency": "quarterly", 
                "confidence": 0.0,
                "reason": "insufficient_data",
                "data_points": len(result),
                "intervals": []
            }
        
        # Extract dates of payments
        payment_dates = []
        for row in result:
            try:
                # Parse the date string to datetime object
                date_str = row[0].split(' ')[0]  # Extract date part
                payment_date = datetime.strptime(date_str, '%Y-%m-%d')
                payment_dates.append(payment_date)
            except (ValueError, IndexError):
                # Skip invalid dates
                continue
        
        # Calculate intervals between payments in days
        intervals = []
        for i in range(1, len(payment_dates)):
            delta = (payment_dates[i] - payment_dates[i-1]).days
            intervals.append(delta)
        
        if not intervals:
            return {
                "symbol": symbol,
                "frequency": "quarterly",
                "confidence": 0.0,
                "reason": "parsing_error",
                "data_points": len(result),
                "intervals": []
            }
        
        # Calculate average interval and standard deviation
        avg_interval = sum(intervals) / len(intervals)
        std_dev = (sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)) ** 0.5
        
        # Count payments per year
        years_data = {}
        for date in payment_dates:
            year = date.year
            if year not in years_data:
                years_data[year] = 0
            years_data[year] += 1
        
        # Calculate average payments per year (excluding incomplete years)
        full_years = [count for year, count in years_data.items() 
                     if year != min(years_data.keys()) and year != max(years_data.keys())]
        
        avg_payments_per_year = sum(full_years) / len(full_years) if full_years else None
        
        # Determine frequency and confidence
        frequency = "quarterly"  # Default
        confidence = 0.0
        reason = "inconclusive"
        
        # Monthly criteria: ~30 day intervals with good consistency
        if 25 <= avg_interval <= 35 and std_dev < 10:
            frequency = "monthly"
            confidence = 0.9 - (std_dev / 100)  # Higher std_dev = lower confidence
            reason = "interval_analysis"
        
        # Quarterly criteria: ~90 day intervals with acceptable consistency
        elif 80 <= avg_interval <= 100 and std_dev < 15:
            frequency = "quarterly"
            confidence = 0.9 - (std_dev / 150)  # Higher std_dev = lower confidence
            reason = "interval_analysis"
        
        # Fallback to counting payments per year
        elif avg_payments_per_year:
            if avg_payments_per_year >= 10:
                frequency = "monthly"
                confidence = 0.7
                reason = "payment_count"
            elif avg_payments_per_year >= 3 and avg_payments_per_year <= 5:
                frequency = "quarterly"
                confidence = 0.7
                reason = "payment_count"
        
        return {
            "symbol": symbol,
            "frequency": frequency,
            "confidence": round(confidence, 2),
            "reason": reason,
            "data_points": len(result),
            "avg_interval_days": round(avg_interval, 1),
            "interval_std_dev": round(std_dev, 1),
            "intervals": intervals,
            "payments_by_year": years_data
        } 