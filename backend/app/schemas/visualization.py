from pydantic import BaseModel
from typing import List, Optional

class SunburstData(BaseModel):
    symbol: str
    sector: str
    industry: str
    market_cap: str
    value: float

class SunburstResponse(BaseModel):
    data: List[SunburstData]
    total_value: float 