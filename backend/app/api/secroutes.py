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

@router.get("/sec/update/{cik}")
def update_sec_data(cik: str, db: Session = Depends(get_sec_db)):
    """
    Fetch and update SEC filing data for a company, storing each 10-Q filing as a separate item keyed by accession number with detailed financial data.
    """
    try:
        print(f"Starting SEC data update for CIK: {cik}")
        # Ensure CIK is padded with leading zeros to 10 digits for API calls, but store unpadded in DB
        unpadded_cik = cik.lstrip('0')
        padded_cik = unpadded_cik.zfill(10)
        
        # Fetch all 10-Q filings from SEC submissions API
        url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Making request to SEC API: {url}")
        response = requests.get(url, headers=headers)
        
        if response.status_code != 200:
            return JSONResponse(
                status_code=response.status_code,
                content={"error": f"Failed to fetch data from SEC API. Status code: {response.status_code}"}
            )
        
        data = response.json()
        print(f"Successfully fetched SEC submissions data")
        
        # Extract all 10-Q filings
        if 'filings' not in data or 'recent' not in data['filings']:
            return JSONResponse(
                status_code=404,
                content={"error": "No filings data found in SEC API response"}
            )
        
        recent_filings = data['filings']['recent']
        form_entries = recent_filings.get('form', [])
        
        # Find all indices where form is '10-Q'
        ten_q_indices = [i for i, form in enumerate(form_entries) if form == '10-Q']
        
        if not ten_q_indices:
            return JSONResponse(
                status_code=404,
                content={"error": "No 10-Q filings found for this CIK"}
            )
        
        # Fetch XBRL data for detailed financial information
        xbrl_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded_cik}.json"
        print(f"Making request to SEC XBRL API: {xbrl_url}")
        xbrl_response = requests.get(xbrl_url, headers=headers)
        xbrl_data = None
        if xbrl_response.status_code == 200:
            xbrl_data = xbrl_response.json()
            print(f"Successfully fetched XBRL data")
        else:
            print(f"Failed to fetch XBRL data: {xbrl_response.status_code}")
        
        # Get company information from XBRL data if available
        company_info = {
            'name': xbrl_data.get('entityName', 'Unknown') if xbrl_data else 'Unknown',
            'cik': xbrl_data.get('cik', unpadded_cik) if xbrl_data else unpadded_cik
        }
        
        # Process XBRL data to organize by filing if available
        filings_data = {}
        if xbrl_data and 'facts' in xbrl_data and 'us-gaap' in xbrl_data['facts']:
            key_concepts = [
                "Assets", "Liabilities", "StockholdersEquity", "NetIncomeLoss",
                "EarningsPerShareBasic", "EarningsPerShareDiluted",
                "CashAndCashEquivalentsAtCarryingValue",
                "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue",
                "OperatingIncomeLoss", "CostOfRevenue", "CostOfGoodsAndServicesSold",
                "CostOfGoodsSold", "GrossProfit"
            ]
            for concept in key_concepts:
                if concept not in xbrl_data['facts']['us-gaap']:
                    continue
                concept_data = xbrl_data['facts']['us-gaap'][concept]
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == '10-Q':
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accessionNumber': accn,
                                    'filingDate': filing.get('filed', ''),
                                    'reportDate': filing.get('end', ''),
                                    'fiscal_year': filing.get('fy', ''),
                                    'fiscal_period': filing.get('fp', ''),
                                    'company': company_info,
                                    'data': {}
                                }
                            if 'start' in filing:
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Store each 10-Q filing individually with detailed data if available
        stored_count = 0
        for idx in ten_q_indices:
            accession_number = recent_filings['accessionNumber'][idx]
            filing_metadata = {
                'form': recent_filings['form'][idx],
                'accessionNumber': accession_number,
                'filingDate': recent_filings['filingDate'][idx],
                'reportDate': recent_filings['reportDate'][idx],
                'primaryDocument': recent_filings['primaryDocument'][idx] if 'primaryDocument' in recent_filings else None,
                'primaryDocDescription': recent_filings['primaryDocDescription'][idx] if 'primaryDocDescription' in recent_filings else None,
                'document_url': f"https://www.sec.gov/Archives/edgar/data/{unpadded_cik}/{accession_number.replace('-', '')}/{recent_filings['primaryDocument'][idx]}" if 'primaryDocument' in recent_filings and recent_filings['primaryDocument'][idx] else None
            }
            
            # Combine metadata with XBRL data if available for this filing
            filing_data = filings_data.get(accession_number, filing_metadata)
            if accession_number in filings_data:
                filing_data.update(filing_metadata)
                filing_data['company'] = company_info
            else:
                filing_data = filing_metadata
            
            # Check if filing already exists
            existing = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == filing_data['accessionNumber'],
                SECFilingData.data_type == '10-Q'
            ).first()
            
            current_time = datetime.utcnow()
            if existing:
                # Update existing record
                existing.data_json = json.dumps(filing_data)
                existing.updated_at = current_time
            else:
                # Create new record
                new_filing = SECFilingData(
                    cik=unpadded_cik,
                    accession_number=filing_data['accessionNumber'],
                    data_type='10-Q',
                    data_json=json.dumps(filing_data)
                )
                db.add(new_filing)
                stored_count += 1
        
        try:
            db.commit()
            print(f"Successfully stored or updated {stored_count} new 10-Q filings")
        except Exception as e:
            db.rollback()
            print(f"Database error while storing filings: {str(e)}")
            return JSONResponse(
                status_code=500,
                content={"error": f"Failed to store filings: {str(e)}"}
            )
        
        # Update company info timestamp
        try:
            company = db.query(SECCompanyInfo).filter(SECCompanyInfo.cik == unpadded_cik).first()
            if company:
                company.updated_at = datetime.utcnow()
                db.commit()
        except Exception as e:
            print(f"Error updating company info timestamp: {str(e)}")
            db.rollback()
        
        return {
            "message": f"Successfully updated SEC data, stored or updated {stored_count} new 10-Q filings",
            "total_filings": len(ten_q_indices)
        }
        
    except Exception as e:
        print(f"Error updating SEC data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to update SEC data: {str(e)}"}
        )

@router.get("/sec/filing/{cik}")
def get_sec_filing_data(cik: str, accession_number: str = None, db: Session = Depends(get_sec_db)):
    """
    Get SEC filing data for a company. If accession_number is provided, returns data for that specific filing.
    Otherwise returns the most recent filing data.
    """
    try:
        # Normalize CIK - remove leading zeros and ensure it's a string
        unpadded_cik = str(int(cik))
        
        print(f"\nDebug - Filing request params:")
        print(f"CIK: {cik}")
        print(f"Unpadded CIK: {unpadded_cik}")
        print(f"Accession Number: {accession_number}")
        
        # If accession number is provided, try to get the specific filing
        if accession_number:
            # First try XBRL data
            query = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == accession_number,
                SECFilingData.data_type == '10-Q-XBRL'
            )
            print(f"\nDebug - SQL Query (XBRL):")
            print(str(query.statement.compile(compile_kwargs={"literal_binds": True})))
            
            filing = query.first()
            
            if filing:
                return json.loads(filing.data_json)
            
            # If no XBRL data, try regular 10-Q data
            query = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == accession_number,
                SECFilingData.data_type == '10-Q'
            )
            print(f"\nDebug - SQL Query (10-Q):")
            print(str(query.statement.compile(compile_kwargs={"literal_binds": True})))
            
            filing = query.first()
            
            if filing:
                return json.loads(filing.data_json)
            
            # If no filing found, try to fetch it from SEC API
            try:
                # Fetch filing metadata from SEC API
                padded_cik = unpadded_cik.zfill(10)
                url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
                headers = {
                    "User-Agent": "Private Research mike@roetto.org"
                }
                response = requests.get(url, headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    recent_filings = data['filings']['recent']
                    form_entries = recent_filings.get('form', [])
                    accession_entries = recent_filings.get('accessionNumber', [])
                    
                    filing_index = None
                    for i, acc_num in enumerate(accession_entries):
                        if acc_num == accession_number and form_entries[i] == '10-Q':
                            filing_index = i
                            break
                    
                    if filing_index is not None:
                        # Found the filing in SEC API, store it in our database
                        filing_data = {
                            'form': recent_filings['form'][filing_index],
                            'accessionNumber': recent_filings['accessionNumber'][filing_index],
                            'filingDate': recent_filings['filingDate'][filing_index],
                            'reportDate': recent_filings['reportDate'][filing_index],
                            'primaryDocument': recent_filings['primaryDocument'][filing_index] if 'primaryDocument' in recent_filings else None,
                            'primaryDocDescription': recent_filings['primaryDocDescription'][filing_index] if 'primaryDocDescription' in recent_filings else None
                        }
                        
                        # Store in database
                        new_filing = SECFilingData(
                            cik=unpadded_cik,
                            accession_number=accession_number,
                            data_type='10-Q',
                            data_json=json.dumps(filing_data)
                        )
                        db.add(new_filing)
                        db.commit()
                        
                        return filing_data
            except Exception as e:
                print(f"Error fetching filing from SEC API: {str(e)}")
            
            return JSONResponse(
                status_code=404,
                content={"error": f"No filing found with accession number {accession_number}"}
            )
        
        # Get the company facts data
        facts = db.query(SECFilingData).filter(
            SECFilingData.cik == unpadded_cik,
            SECFilingData.data_type == 'SEC-CompanyFacts'
        ).first()
        
        if not facts:
            # Try the old format
            facts = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == "all_facts"
            ).first()
            
            if not facts:
                return JSONResponse(
                    status_code=404,
                    content={"error": "No SEC data found for this CIK"}
                )
            
            # Update to new format
            facts.data_type = 'SEC-CompanyFacts'
            facts.accession_number = "company_facts"
            db.commit()
            
        data = json.loads(facts.data_json)
        
        # Get company information
        company_info = {
            'name': data.get('entityName', 'Unknown'),
            'cik': data.get('cik', 'Unknown')
        }
        
        # Extract filings data
        filings_data = {}
        
        if 'facts' in data and 'us-gaap' in data['facts']:
            # Process all concepts in the us-gaap taxonomy
            for concept, concept_data in data['facts']['us-gaap'].items():
                # Process each unit (USD, USD/shares, etc.)
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == '10-Q':
                            # Use accession number as unique identifier for the filing
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accession_number': accn,
                                    'filing_date': filing.get('filed'),
                                    'report_date': filing.get('end'),
                                    'fiscal_year': filing.get('fy'),
                                    'fiscal_period': filing.get('fp'),
                                    'data': {}
                                }
                            
                            # Store the concept value
                            if 'start' in filing:
                                # This is a period value (like income)
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                # This is a point-in-time value (like assets)
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Convert to a list of filings
        filings_list = []
        for accn, filing_data in filings_data.items():
            filing_data['company'] = company_info
            filings_list.append(filing_data)
        
        # Sort by filing date (most recent first)
        filings_list.sort(key=lambda x: x.get('filing_date', ''), reverse=True)
        
        if not filings_list:
            return JSONResponse(
                status_code=404,
                content={"error": "No 10-Q filings found for this CIK"}
            )
        
        return {
            "cik": cik,
            "company_name": company_info['name'],
            "total_filings": len(filings_list),
            "filings": filings_list
        }
        
    except Exception as e:
        print(f"Error retrieving SEC data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to retrieve SEC data: {str(e)}"}
        )
@router.get("/sec/filing/{accession_number}")
def get_filing_by_accession(accession_number: str, db: Session = Depends(get_sec_db)):
    """
    Retrieve a specific SEC filing by its accession number.
    """
    try:
        # Simple query to get the filing data
        filing = db.query(SECFilingData).filter(
            SECFilingData.accession_number == accession_number
        ).first()
        
        if not filing:
            return JSONResponse(
                status_code=404,
                content={"error": f"Filing not found: {accession_number}"}
            )
        
        return json.loads(filing.data_json)
    except Exception as e:
        print(f"Error retrieving filing {accession_number}: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to retrieve filing: {str(e)}"}
        )
@router.get("/sec/company-metrics/{cik}")
def get_company_metrics(cik: str, form_type: str = "10-Q", db: Session = Depends(get_sec_db)):
    """
    Extract specific metrics from company facts data for a particular form type
    This endpoint provides a compatibility layer that extracts metrics in the same
    format as the original filtered data approach
    """
    try:
        # Normalize CIK
        unpadded_cik = cik.lstrip('0')
        
        # Retrieve the complete company facts
        facts = db.query(SECFilingData).filter(
            SECFilingData.cik == unpadded_cik,
            SECFilingData.data_type == 'SEC-CompanyFacts'
        ).first()
        
        if not facts:
            return JSONResponse(
                status_code=404,
                content={"error": "No company facts found for this CIK"}
            )
            
        data = json.loads(facts.data_json)
        
        # Get company information
        company_info = {
            'name': data.get('entityName', 'Unknown'),
            'cik': data.get('cik', 'Unknown')
        }
        
        # Extract filings of the requested form type
        filings_data = {}
        
        if 'facts' in data and 'us-gaap' in data['facts']:
            # Process all concepts in the us-gaap taxonomy
            for concept, concept_data in data['facts']['us-gaap'].items():
                # Process each unit (USD, USD/shares, etc.)
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == form_type:
                            # Use accession number as unique identifier for the filing
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accession_number': accn,
                                    'filing_date': filing.get('filed'),
                                    'report_date': filing.get('end'),
                                    'fiscal_year': filing.get('fy'),
                                    'fiscal_period': filing.get('fp'),
                                    'data': {}
                                }
                            
                            # Store the concept value
                            if 'start' in filing:
                                # This is a period value (like income)
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                # This is a point-in-time value (like assets)
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Convert to a list of filings
        filings_list = []
        for accn, filing_data in filings_data.items():
            filing_data['company'] = company_info
            filings_list.append(filing_data)
        
        # Sort by filing date (most recent first)
        filings_list.sort(key=lambda x: x.get('filing_date', ''), reverse=True)
        
        if not filings_list:
            return JSONResponse(
                status_code=404,
                content={"error": f"No {form_type} filings found for this CIK"}
            )
        
        return {
            "cik": cik,
            "company_name": company_info['name'],
            "total_filings": len(filings_list),
            "filings": filings_list
        }
        
    except Exception as e:
        print(f"Error extracting metrics: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to extract metrics: {str(e)}"}
        )
@router.get("/sec/company-facts/{cik}")
def get_company_facts(cik: str, db: Session = Depends(get_sec_db)):
    """
    Retrieve the complete company facts data from the database
    This endpoint returns all available financial data for a company
    """
    try:
        # Normalize CIK
        unpadded_cik = cik.lstrip('0')
        
        # Retrieve the complete company facts
        facts = db.query(SECFilingData).filter(
            SECFilingData.cik == unpadded_cik,
            SECFilingData.data_type == 'SEC-CompanyFacts'
        ).first()
        
        if not facts:
            return JSONResponse(
                status_code=404,
                content={"error": "No company facts found for this CIK"}
            )
            
        return json.loads(facts.data_json)
        
    except Exception as e:
        print(f"Error retrieving company facts: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to retrieve company facts: {str(e)}"}
        )

@router.get("/sec/10q/{cik}/xbrl")
def get_10q_xbrl_data(cik: str, db: Session = Depends(get_sec_db)):
    """
    Fetch 10-Q filing data using the SEC XBRL API and store it in the database
    The XBRL API provides structured financial data in a machine-readable format.
    """
    try:
        print(f"Starting XBRL data fetch for CIK: {cik}")
        # Ensure CIK is padded with leading zeros to 10 digits
        unpadded_cik = cik.lstrip('0')
        padded_cik = unpadded_cik.zfill(10)
        
        # Fetch company facts from SEC XBRL API
        url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded_cik}.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Making request to SEC XBRL API: {url}")
        response = requests.get(url, headers=headers)
        
        if response.status_code != 200:
            return JSONResponse(
                status_code=response.status_code,
                content={"error": f"Failed to fetch data from SEC API. Status code: {response.status_code}"}
            )
        
        data = response.json()
        print(f"Successfully fetched XBRL data")
        
        # Filter out 10-K data and create a filtered version for storage
        filtered_data = {
            'cik': data.get('cik'),
            'entityName': data.get('entityName'),
            'facts': {
                'us-gaap': {}
            }
        }
        
        # Process and filter the data
        if 'facts' in data and 'us-gaap' in data['facts']:
            for concept, concept_data in data['facts']['us-gaap'].items():
                filtered_units = {}
                for unit_type, units in concept_data.get('units', {}).items():
                    # Filter to only include 10-Q filings
                    filtered_units[unit_type] = [
                        unit for unit in units 
                        if unit.get('form') == '10-Q'
                    ]
                    if filtered_units[unit_type]:  # Only add if we have 10-Q data
                        filtered_data['facts']['us-gaap'][concept] = {
                            'label': concept_data.get('label'),
                            'description': concept_data.get('description'),
                            'units': {unit_type: filtered_units[unit_type]}
                        }
        
        # Removed code for downloading and populating SEC-CompanyFacts data
        # The following block has been commented out to prevent storage of company facts data
        # try:
        #     # Check if we already have the complete facts
        #     existing_facts = db.query(SECFilingData).filter(
        #         SECFilingData.cik == unpadded_cik,
        #         SECFilingData.data_type == 'SEC-CompanyFacts'
        #     ).first()
        #     
        #     current_time = datetime.utcnow()
        #     
        #     if existing_facts:
        #         # Update the existing record
        #         existing_facts.data_json = json.dumps(filtered_data)
        #         existing_facts.updated_at = current_time
        #         db.commit()
        #         print(f"Updated filtered company facts for CIK {unpadded_cik}")
        #     else:
        #         # Store the filtered company facts
        #         facts_data = SECFilingData(
        #             cik=unpadded_cik,
        #             accession_number="all_facts",
        #             data_type='SEC-CompanyFacts',
        #             data_json=json.dumps(filtered_data)
        #         )
        #         db.add(facts_data)
        #         db.commit()
        #         print(f"Stored filtered company facts for CIK {unpadded_cik}")
        # except Exception as e:
        #     db.rollback()
        #     print(f"Error storing filtered company facts: {str(e)}")
        #     # Continue with the regular process even if this fails
        
        # Key financial concepts to extract
        key_concepts = [
            "Assets",
            "Liabilities", 
            "StockholdersEquity",
            "NetIncomeLoss",
            "EarningsPerShareBasic",
            "EarningsPerShareDiluted",
            "CashAndCashEquivalentsAtCarryingValue",
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenue",
            "OperatingIncomeLoss",
            "CostOfRevenue",
            "CostOfGoodsAndServicesSold",
            "CostOfGoodsSold",
            "GrossProfit"
        ]
        
        # Initialize data structure to store 10-Q data
        filings_data = {}
        
        # Get company information
        company_info = {
            'name': filtered_data.get('entityName', 'Unknown'),
            'cik': filtered_data.get('cik', 'Unknown')
        }
        
        # Extract key financial concepts from each 10-Q filing
        if 'facts' in filtered_data and 'us-gaap' in filtered_data['facts']:
            for concept in key_concepts:
                if concept not in filtered_data['facts']['us-gaap']:
                    print(f"Concept '{concept}' not found in data")
                    continue
                
                concept_data = filtered_data['facts']['us-gaap'][concept]
                
                # Process each unit (USD, USD/shares, etc.)
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        # Use accession number as unique identifier for the filing
                        accn = filing.get('accn')
                        if accn not in filings_data:
                            filings_data[accn] = {
                                'accession_number': accn,
                                'filing_date': filing.get('filed'),
                                'report_date': filing.get('end'),
                                'fiscal_year': filing.get('fy'),
                                'fiscal_period': filing.get('fp'),
                                'data': {}
                            }
                        
                        # Store the concept value
                        if 'start' in filing:
                            # This is a period value (like income)
                            filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                'value': filing.get('val'),
                                'start_date': filing.get('start'),
                                'end_date': filing.get('end'),
                                'unit': unit_type
                            }
                        else:
                            # This is a point-in-time value (like assets)
                            filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                'value': filing.get('val'),
                                'date': filing.get('end'),
                                'unit': unit_type
                            }
        
        # Convert to a list of filings
        filings_list = []
        for accn, filing_data in filings_data.items():
            filing_data['company'] = company_info
            filings_list.append(filing_data)
        
        # Sort by filing date (most recent first)
        filings_list.sort(key=lambda x: x.get('filing_date', ''), reverse=True)
        
        # Store individual filings in the database
        stored_count = 0
        updated_count = 0
        
        for filing in filings_list:
            try:
                # Check if filing already exists
                existing = db.query(SECFilingData).filter(
                    SECFilingData.cik == unpadded_cik,
                    SECFilingData.accession_number == filing['accession_number'],
                    SECFilingData.data_type == '10-Q-XBRL'
                ).first()
                
                if existing:
                    # Update existing filing
                    existing.data_json = json.dumps(filing)
                    existing.updated_at = current_time
                    updated_count += 1
                else:
                    # Store new filing
                    filing_data = SECFilingData(
                        cik=unpadded_cik,
                        accession_number=filing['accession_number'],
                        data_type='10-Q-XBRL',
                        data_json=json.dumps(filing)
                    )
                    db.add(filing_data)
                    stored_count += 1
            except Exception as e:
                print(f"Error storing filing {filing['accession_number']}: {str(e)}")
                continue
        
        try:
            db.commit()
            print(f"Successfully stored {stored_count} new filings and updated {updated_count} existing filings")
        except Exception as e:
            db.rollback()
            print(f"Database error while storing filings: {str(e)}")
        
        # Update company info table with the latest retrieval
        try:
            company = db.query(SECCompanyInfo).filter(SECCompanyInfo.cik == unpadded_cik).first()
            if company:
                company.updated_at = current_time
                db.commit()
        except Exception as e:
            print(f"Error updating company info timestamp: {str(e)}")
            db.rollback()
        
        return {
            "cik": cik,
            "company_name": company_info['name'],
            "total_filings": len(filings_list),
            "new_filings_stored": stored_count,
            "updated_filings": updated_count,
            "filings": filings_list
        }
        
    except Exception as e:
        print(f"Error processing XBRL data: {str(e)}")
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"error": f"Failed to process XBRL data: {str(e)}"}
        )

@router.get("/sec/10q/{cik}/content/{accession_number}")
def get_filing_content(cik: str, accession_number: str, db: Session = Depends(get_sec_db)):
    try:
        print(f"Fetching content for 10-Q filing {accession_number} for CIK: {cik}")
        
        # Check if we have this filing in our database
        filing = db.query(SECFilingData).filter(
            SECFilingData.cik == cik,
            SECFilingData.accession_number == accession_number,
            SECFilingData.data_type == '10-Q'
        ).first()
        
        if not filing:
            # Fetch filing metadata if not in database
            # First, remove any existing padding to ensure we don't over-pad
            unpadded_cik = cik.lstrip('0')
            padded_cik = unpadded_cik.zfill(10)
            url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
            headers = {
                "User-Agent": "Private Research mike@roetto.org"
            }
            
            response = requests.get(url, headers=headers)
            if response.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Failed to fetch filing metadata from SEC API")
            
            data = response.json()
            recent_filings = data['filings']['recent']
            form_entries = recent_filings.get('form', [])
            accession_entries = recent_filings.get('accessionNumber', [])
            
            filing_index = None
            for i, acc_num in enumerate(accession_entries):
                if acc_num == accession_number and form_entries[i] == '10-Q':
                    filing_index = i
                    break
            
            if filing_index is None:
                raise HTTPException(status_code=404, detail=f"Filing with accession number {accession_number} not found")
            
            # Get primary document name
            primary_doc = recent_filings.get('primaryDocument', [])[filing_index] if 'primaryDocument' in recent_filings else None
            if not primary_doc:
                raise HTTPException(status_code=404, detail=f"Primary document not found for filing {accession_number}")
            
            # Format accession number to match SEC file structure (remove dashes)
            formatted_accession = accession_number.replace('-', '')
            
            # Build URL to fetch the HTML document content
            document_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{formatted_accession}/{primary_doc}"
        else:
            # Extract information from stored filing data
            filing_data = json.loads(filing.data_json)
            
            # Get primary document
            primary_doc = filing_data.get('primaryDocument')
            if not primary_doc:
                raise HTTPException(status_code=404, detail=f"Primary document not found for filing {accession_number}")
            
            # Format accession number to match SEC file structure (remove dashes)
            formatted_accession = accession_number.replace('-', '')
            
            # Build URL to fetch the HTML document content
            document_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{formatted_accession}/{primary_doc}"
        
        # Fetch the actual filing content
        print(f"Fetching document from: {document_url}")
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        content_response = requests.get(document_url, headers=headers)
        
        if content_response.status_code != 200:
            raise HTTPException(
                status_code=500, 
                detail=f"Failed to fetch document content. Status: {content_response.status_code}"
            )
        
        # Return the document content and metadata
        return {
            "message": "Successfully retrieved filing content",
            "document_url": document_url,
            "content": content_response.text
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in get_filing_content: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

@router.get("/sec/10q/{cik}/all")
def get_all_10q(cik: str, db: Session = Depends(get_sec_db)):
    try:
        print(f"Starting fetch for all 10-Q filings for CIK: {cik}")
        # Ensure CIK is padded with leading zeros to 10 digits
        unpadded_cik = cik.lstrip('0')
        padded_cik = unpadded_cik.zfill(10)
        
        # Fetch all filings from SEC submissions API
        url = f"https://data.sec.gov/submissions/CIK{padded_cik}.json"
        headers = {
            "User-Agent": "Private Research mike@roetto.org"
        }
        print(f"Making request to SEC API: {url}")
        response = requests.get(url, headers=headers)
        print(f"SEC API response status code: {response.status_code}")
        
        if response.status_code != 200:
            print(f"SEC API error response: {response.text}")
            raise HTTPException(status_code=500, detail=f"Failed to fetch from SEC API. Status: {response.status_code}, Response: {response.text}")

        try:
            data = response.json()
            print(f"Successfully parsed JSON response")
        except json.JSONDecodeError as e:
            print(f"Failed to parse JSON response: {str(e)}")
            print(f"Response content: {response.text[:500]}...")
            raise HTTPException(status_code=500, detail=f"Invalid JSON response from SEC API: {str(e)}")

        # Extract all 10-Q filings from the response
        if 'filings' not in data or 'recent' not in data['filings']:
            print("No filings data found in response")
            raise HTTPException(status_code=404, detail="No filings data found in SEC API response")
        
        recent_filings = data['filings']['recent']
        form_entries = recent_filings.get('form', [])
        
        # Find all indices where the form type is '10-Q'
        ten_q_indices = []
        for i, form in enumerate(form_entries):
            if form == '10-Q':
                ten_q_indices.append(i)
        
        if not ten_q_indices:
            print("No 10-Q filings found in the response")
            raise HTTPException(status_code=404, detail="No 10-Q filing found")

        # Fetch XBRL data for detailed financial information
        xbrl_url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{padded_cik}.json"
        print(f"Making request to SEC XBRL API: {xbrl_url}")
        xbrl_response = requests.get(xbrl_url, headers=headers)
        xbrl_data = None
        if xbrl_response.status_code == 200:
            xbrl_data = xbrl_response.json()
            print(f"Successfully fetched XBRL data")
        else:
            print(f"Failed to fetch XBRL data: {xbrl_response.status_code}")
        
        # Get company information from XBRL data if available
        company_info = {
            'name': xbrl_data.get('entityName', 'Unknown') if xbrl_data else 'Unknown',
            'cik': xbrl_data.get('cik', unpadded_cik) if xbrl_data else unpadded_cik
        }
        
        # Process XBRL data to organize by filing if available
        filings_data = {}
        if xbrl_data and 'facts' in xbrl_data and 'us-gaap' in xbrl_data['facts']:
            key_concepts = [
                "Assets", "Liabilities", "StockholdersEquity", "NetIncomeLoss",
                "EarningsPerShareBasic", "EarningsPerShareDiluted",
                "CashAndCashEquivalentsAtCarryingValue",
                "RevenueFromContractWithCustomerExcludingAssessedTax", "Revenue",
                "OperatingIncomeLoss", "CostOfRevenue", "CostOfGoodsAndServicesSold",
                "CostOfGoodsSold", "GrossProfit"
            ]
            for concept in key_concepts:
                if concept not in xbrl_data['facts']['us-gaap']:
                    continue
                concept_data = xbrl_data['facts']['us-gaap'][concept]
                for unit_type, units in concept_data.get('units', {}).items():
                    for filing in units:
                        if filing.get('form') == '10-Q':
                            accn = filing.get('accn')
                            if accn not in filings_data:
                                filings_data[accn] = {
                                    'accessionNumber': accn,
                                    'filingDate': filing.get('filed', ''),
                                    'reportDate': filing.get('end', ''),
                                    'fiscal_year': filing.get('fy', ''),
                                    'fiscal_period': filing.get('fp', ''),
                                    'company': company_info,
                                    'data': {}
                                }
                            if 'start' in filing:
                                filings_data[accn]['data'][f"{concept}_{unit_type}_period"] = {
                                    'value': filing.get('val'),
                                    'start_date': filing.get('start'),
                                    'end_date': filing.get('end'),
                                    'unit': unit_type
                                }
                            else:
                                filings_data[accn]['data'][f"{concept}_{unit_type}"] = {
                                    'value': filing.get('val'),
                                    'date': filing.get('end'),
                                    'unit': unit_type
                                }
        
        # Extract data for all 10-Q filings and combine with XBRL data if available
        all_10q_filings = []
        stored_count = 0
        for idx in ten_q_indices:
            accession_number = recent_filings['accessionNumber'][idx]
            filing_metadata = {
                'form': recent_filings['form'][idx],
                'accessionNumber': accession_number,
                'filingDate': recent_filings['filingDate'][idx],
                'reportDate': recent_filings['reportDate'][idx],
                'primaryDocument': recent_filings['primaryDocument'][idx] if 'primaryDocument' in recent_filings else None,
                'primaryDocDescription': recent_filings['primaryDocDescription'][idx] if 'primaryDocDescription' in recent_filings else None,
                'document_url': f"https://www.sec.gov/Archives/edgar/data/{unpadded_cik}/{accession_number.replace('-', '')}/{recent_filings['primaryDocument'][idx]}" if 'primaryDocument' in recent_filings and recent_filings['primaryDocument'][idx] else None
            }
            
            # Combine metadata with XBRL data if available for this filing
            filing_data = filings_data.get(accession_number, filing_metadata)
            if accession_number in filings_data:
                filing_data.update(filing_metadata)
                filing_data['company'] = company_info
            else:
                filing_data = filing_metadata
            
            all_10q_filings.append(filing_data)
            
            # Check if filing already exists
            existing = db.query(SECFilingData).filter(
                SECFilingData.cik == unpadded_cik,
                SECFilingData.accession_number == filing_data['accessionNumber'],
                SECFilingData.data_type == '10-Q'
            ).first()
            
            current_time = datetime.utcnow()
            if existing:
                # Update existing record
                existing.data_json = json.dumps(filing_data)
                existing.updated_at = current_time
            else:
                # Create new record
                new_filing = SECFilingData(
                    cik=unpadded_cik,
                    accession_number=filing_data['accessionNumber'],
                    data_type='10-Q',
                    data_json=json.dumps(filing_data)
                )
                db.add(new_filing)
                stored_count += 1
        
        # Commit all new filings
        try:
            db.commit()
            print(f"Successfully stored or updated {stored_count} new 10-Q filings in database for CIK {unpadded_cik}")
        except Exception as db_error:
            print(f"Database error while storing 10-Q data: {str(db_error)}")
            db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to store 10-Q data: {str(db_error)}")

        return {
            "message": f"Retrieved {len(all_10q_filings)} 10-Q filings, stored or updated {stored_count} new filings", 
            "filings": all_10q_filings
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Unexpected error in get_all_10q: {str(e)}")
        print(f"Error type: {type(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

