from pydantic import BaseModel
from typing import Optional

class Position(BaseModel):
    symbol: str
    units: float
    current_price: float
    position_value: float
    ma50: Optional[float] = None
    ma200: Optional[float] = None
    cost_basis: float
    unrealized_gain: float
    unrealized_gain_percent: float
    sector: str
    dividend_yield: float
    annual_dividend: float
    logo_url: Optional[str] = None
    realized_pl: float = 0.0
    total_dividends: float = 0.0 