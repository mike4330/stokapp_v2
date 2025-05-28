from pydantic import BaseModel
from typing import Optional

class MPTData(BaseModel):
    symbol: str
    sector: str

class MPTSymbol(BaseModel):
    symbol: str
    target_alloc: float

class ModelRecommendation(BaseModel):
    symbol: str
    sectorshort: str
    z_score: float
    overamt: float 