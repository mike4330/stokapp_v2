from sqlalchemy import Column, Integer, String, Float, DECIMAL, Text
from sqlalchemy.ext.declarative import declarative_base

# Create Base. This should be imported from session.py in a real app,
# but we'll define it here for clarity
Base = declarative_base()

class Price(Base):
    """Model for the 'prices' table"""
    __tablename__ = "prices"
    
    symbol = Column(String, primary_key=True)
    asset_class = Column(String)
    price = Column(Float)
    lastupdate = Column(Integer)
    alloc_target = Column(Float)
    compidx = Column(Float)
    compidx2 = Column(Float)
    stdev = Column(Float)
    laststatupdate = Column(Integer)
    volat = Column(Float)
    class_ = Column("class", String)  # Using class_ because 'class' is a Python keyword
    hlr = Column(Float)
    mean50 = Column(Float)
    mean200 = Column(Float)
    divyield = Column(Float)
    vol90 = Column(Float)

class Transaction(Base):
    """Model for the 'transactions' table"""
    __tablename__ = "transactions"
    
    id = Column(Integer, primary_key=True)
    date_new = Column(String)
    symbol = Column(String, index=True)
    xtype = Column(String)
    acct = Column(String)
    price = Column(Float)
    units = Column(Float)
    units_remaining = Column(Float)
    gain = Column(Float)
    lotgain = Column(Float)
    term = Column(String)
    disposition = Column(String)
    datetime = Column(String)
    fee = Column(Float)
    note = Column(String)
    tradetype = Column(String)

class SecurityValue(Base):
    """Model for the 'security_values' table"""
    __tablename__ = "security_values"
    
    # This table appears to have a composite primary key in your schema
    symbol = Column(String, primary_key=True)
    timestamp = Column(String, primary_key=True)
    high = Column(String)
    close = Column(String)
    volume = Column(String)
    shares = Column(Float)
    cost_basis = Column(Float)
    return_ = Column("return", Float)  # 'return' is a Python keyword, so using return_
    cum_divs = Column(Float)
    cbps = Column(Float)
    cum_real_gl = Column(Float)

class MPT(Base):
    """Model for the 'MPT' table"""
    __tablename__ = "MPT"
    
    symbol = Column(String, primary_key=True)
    target_alloc = Column(Float)
    sectorshort = Column(String)
    sector = Column(String)
    industry = Column(String)
    market_cap = Column(String)
    pe = Column(Float)
    range = Column(Float)
    flag = Column(String)
    avgflag = Column(String)
    divyield = Column(Float)
    beta = Column(Float)
    recm = Column(String)
    overamt = Column(Float)
    target_price = Column(Float)
    div_growth_rate = Column(Float)
    market_cap_val = Column(DECIMAL(15, 2))
    RSI = Column(Float)
    fcf_ni_ratio = Column(Float)
