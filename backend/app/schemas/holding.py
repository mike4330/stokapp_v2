from pydantic import BaseModel
from typing import Optional

class Holding(BaseModel):
    symbol: str
    units: float
    current_price: float
    position_value: float
    ma50: Optional[float] = None
    ma200: Optional[float] = None
    overamt: Optional[float] = None
    price_change: Optional[float] = None
    price_change_pct: Optional[float] = None
    unrealized_gain: float
    unrealized_gain_percent: float
    acct: Optional[str] = None 