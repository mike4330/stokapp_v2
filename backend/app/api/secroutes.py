from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import requests
from app.db.sec_session import get_sec_db
from app.models.sec_models import SECCompanyInfo, SECFilingData

router = APIRouter()

@router.get("/sec/cik/{symbol}")
def get_cik(symbol: str, db: Session = Depends(get_sec_db)):
    try:
        print(f"Fetching CIK for symbol: {symbol}")
        # Check if CIK is already stored
        company = db.query(SECCompanyInfo).filter(SECCompanyInfo.symbol == symbol).first()
        if company:
            print(f"CIK found in database: {company.cik}")
            return {"cik": company.cik}

        # Fetch CIK from SEC API
        url = f"https://www.sec.gov/files/company_tickers.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Fetching CIK from SEC API: {url}")
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            print(f"Failed to fetch CIK from SEC API: {response.status_code}")
            raise HTTPException(status_code=500, detail="Failed to fetch CIK from SEC API")

        data = response.json()
        cik = None
        for entry in data.values():
            if entry.get("ticker") == symbol:
                cik = str(entry.get("cik_str")).zfill(10)
                break

        if not cik:
            print(f"CIK not found for symbol: {symbol}")
            raise HTTPException(status_code=404, detail=f"CIK not found for symbol {symbol}")

        # Store CIK in database
        new_company = SECCompanyInfo(cik=cik, symbol=symbol)
        db.add(new_company)
        db.commit()
        print(f"CIK stored in database: {cik}")

        return {"cik": cik}
    except Exception as e:
        db.rollback()
        print(f"Error fetching CIK: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/sec/last-retrieval-dates")
def get_last_retrieval_dates(db: Session = Depends(get_sec_db)):
    """
    Returns the last retrieval dates of SEC filings for all symbols.
    This lets the frontend display when data was last fetched from the SEC.
    """
    try:
        # First, get the list of distinct CIKs that have filings in sec_filing_data
        ciks_with_data_query = db.query(SECFilingData.cik).distinct().all()
        ciks_with_data = set(row[0] for row in ciks_with_data_query)
        
        print(f"Found {len(ciks_with_data)} CIKs with filing data: {ciks_with_data}")
        
        # Get all company symbols from the company info table
        companies = db.query(SECCompanyInfo).all()
        result = []
        
        for company in companies:
            # Normalize CIK (strip leading zeros to match database format)
            normalized_cik = company.cik.lstrip('0')
            
            # Find the most recent SEC filing data (10-Q-XBRL preferred)
            latest_filing = db.query(SECFilingData).filter(
                SECFilingData.cik == normalized_cik,
                SECFilingData.data_type == '10-Q-XBRL'
            ).order_by(SECFilingData.created_at.desc()).first()
            
            # If no XBRL data, try regular 10-Q
            if not latest_filing:
                latest_filing = db.query(SECFilingData).filter(
                    SECFilingData.cik == normalized_cik,
                    SECFilingData.data_type == '10-Q'
                ).order_by(SECFilingData.created_at.desc()).first()
            
            # Check if this CIK has any filings in the database
            has_data = normalized_cik in ciks_with_data
            
            # Add to results
            result.append({
                "symbol": company.symbol,
                "cik": company.cik,
                "last_retrieved": latest_filing.created_at.isoformat() if latest_filing else None,
                "has_data": has_data
            })
        
        return result
    except Exception as e:
        print(f"Error fetching last retrieval dates: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to fetch SEC data retrieval dates: {str(e)}") 