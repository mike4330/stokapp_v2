import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { evaluateRules, RuleContext, RuleResult, FilingMetricValue } from '../utils/secRules';
import SECRuleEvaluation from '../components/SECRuleEvaluation';

// Tooltip component for consistency
interface TooltipProps {
  content: string;
  size?: 'sm' | 'md';
}

const Tooltip: React.FC<TooltipProps> = ({ content, size = 'sm' }) => {
  return (
    <span className="ml-1 inline-block text-gray-400 cursor-help relative group">
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className={`${size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} inline`} 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div 
        className="absolute z-50 opacity-0 group-hover:opacity-100 invisible group-hover:visible
                  transition-opacity duration-200 ease-in-out bg-gray-900 text-xs text-white p-2 
                  rounded shadow-lg min-w-[200px] max-w-xs -left-3 top-full mt-1 pointer-events-none"
        role="tooltip"
      >
        <div className="font-semibold mb-1">Original GAAP term:</div>
        <div className="font-mono bg-gray-800 p-1 rounded overflow-auto max-w-full">{content}</div>
      </div>
    </span>
  );
};

// Utility to format large numbers with dynamic units
function formatLargeNumber(value: number): string {
  if (Math.abs(value) >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  } else if (Math.abs(value) >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  } else if (Math.abs(value) >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  } else if (Math.abs(value) >= 1e3) {
    return `$${(value / 1e3).toFixed(2)}K`;
  } else {
    return `$${value.toFixed(2)}`;
  }
}

// GAAP term to plain English translation dictionary
const gaapTranslations: Record<string, string> = {
  // Balance Sheet
  "Assets": "Total Assets",
  "AssetsCurrent": "Current Assets",
  "CashAndCashEquivalentsAtCarryingValue": "Cash & Equivalents",
  "Liabilities": "Total Liabilities",
  "LiabilitiesCurrent": "Current Liabilities",
  "StockholdersEquity": "Shareholders' Equity",
  "AccountsReceivableNetCurrent": "Accounts Receivable",
  "InventoryNet": "Inventory",
  "PropertyPlantAndEquipmentNet": "Property & Equipment",
  "GoodwillAndIntangibleAssets": "Goodwill & Intangibles",
  "LongTermDebt": "Long-term Debt",
  "AccountsPayableCurrent": "Accounts Payable",
  "AccruedLiabilitiesCurrent": "Accrued Liabilities",
  
  // Income Statement
  "RevenueFromContractWithCustomerExcludingAssessedTax": "Revenue",
  "CostOfRevenue": "Cost of Revenue",
  "GrossProfit": "Gross Profit",
  "OperatingIncomeLoss": "Operating Income",
  "NetIncomeLoss": "Net Income",
  "ResearchAndDevelopmentExpense": "R&D Expense",
  "SellingGeneralAndAdministrativeExpense": "SG&A Expense",
  "IncomeTaxExpenseBenefit": "Income Tax Expense",
  "InterestExpense": "Interest Expense",
  "OperatingExpenses": "Operating Expenses",
  
  // Cash Flow
  "NetCashProvidedByUsedInOperatingActivities": "Operating Cash Flow",
  "NetCashProvidedByUsedInInvestingActivities": "Investing Cash Flow",
  "NetCashProvidedByUsedInFinancingActivities": "Financing Cash Flow",
  "PaymentsToAcquirePropertyPlantAndEquipment": "Capital Expenditures",
  
  // Per Share
  "EarningsPerShareBasic": "EPS (Basic)",
  "EarningsPerShareDiluted": "EPS (Diluted)",
  "WeightedAverageNumberOfSharesOutstandingBasic": "Shares Outstanding (Basic)",
  "WeightedAverageNumberOfDilutedSharesOutstanding": "Shares Outstanding (Diluted)",
  "DividendsPaid": "Dividends Paid",
  "DividendsPerShareCommonStockDeclared": "Dividends Per Share"
};

// Function to convert camelCase to Title Case with spaces
function camelCaseToTitleCase(text: string): string {
  // Handle special GAAP prefixes
  text = text.replace(/^(us-gaap|ifrs|dei|srt):/, "");
  
  // Insert space before capital letters and uppercase the first letter
  const spaced = text.replace(/([A-Z])/g, ' $1').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Function to get a human-readable name for a GAAP metric
function getMetricDisplayName(conceptName: string): { display: string, original: string } {
  // Remove any namespace prefixes (like "us-gaap:")
  const cleanName = conceptName.replace(/^(us-gaap|ifrs|dei|srt):/, "");
  
  // Check if we have a translation for this exact concept
  if (gaapTranslations[cleanName]) {
    return { 
      display: gaapTranslations[cleanName],
      original: cleanName
    };
  }
  
  // Otherwise, convert from camelCase to Title Case
  return {
    display: camelCaseToTitleCase(cleanName),
    original: cleanName
  };
}

const SecDetails: React.FC = () => {
  const { accession } = useParams<{ accession: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filing, setFiling] = useState<any>(null);
  const [company, setCompany] = useState<{ name?: string; cik?: string } | null>(null);
  const [allMetrics, setAllMetrics] = useState<Record<string, any>>({});
  const [loadingAllMetrics, setLoadingAllMetrics] = useState(false);
  const [previousQuarterFiling, setPreviousQuarterFiling] = useState<any>(null);
  const [previousYearSameFiling, setPreviousYearSameFiling] = useState<any>(null);
  const [loadingPreviousFilings, setLoadingPreviousFilings] = useState(false);
  const [ruleResults, setRuleResults] = useState<Record<string, RuleResult>>({});
  const [loadingRuleEvaluation, setLoadingRuleEvaluation] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get the filing data directly using the accession number
        const filingResp = await axios.get(`/api/sec/filing/${accession}`);
        const filing = filingResp.data;
        setFiling(filing);
        setCompany({ name: filing.company.name, cik: filing.company.cik });
        
        // Evaluate SEC rules with the filing data
        evaluateSecRules(filing);
      } catch (err: any) {
        if (err.response && err.response.status === 404) {
          setError('SEC filing data not found for this accession number. It may not be available in the database.');
        } else {
          setError(err.message || 'Failed to load SEC filing');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [accession]);

  const fetchPreviousFilings = async (allFilings: any[], currentFiling: any) => {
    // This function is no longer needed but kept for possible future use
  };
  
  const evaluateSecRules = (currentFiling: any) => {
    if (!currentFiling) return;
    
    setLoadingRuleEvaluation(true);
    
    try {
      console.log("SEC Filing Data for Rule Evaluation:", currentFiling);
      
      // Log all metric keys to help with debugging
      if (currentFiling.data) {
        const metricKeys = Object.keys(currentFiling.data);
        console.log(`Found ${metricKeys.length} metrics in filing`, metricKeys);
        
        // Log revenue-related metrics
        const revenueMetrics = metricKeys.filter(k => 
          k.toLowerCase().includes('revenue') && 
          !k.toLowerCase().includes('cost')
        );
        console.log("Revenue metrics:", revenueMetrics);
        
        // Log cost-related metrics
        const costMetrics = metricKeys.filter(k => 
          k.toLowerCase().includes('cost') || 
          k.toLowerCase().includes('goods sold')
        );
        console.log("Cost metrics:", costMetrics);
        
        // Log some values for key metrics
        revenueMetrics.forEach(key => {
          console.log(`${key}: ${currentFiling.data[key].value}`);
        });
      }
      
      // Convert filing data to the format expected by rule evaluation
      const convertFilingToMetrics = (filing: any): Record<string, FilingMetricValue> => {
        const result: Record<string, FilingMetricValue> = {};
        if (!filing || !filing.data) return result;
        
        Object.entries(filing.data).forEach(([key, value]: [string, any]) => {
          result[key] = {
            value: value.value,
            date: value.date,
            start_date: value.start_date,
            end_date: value.end_date,
            unit: value.unit
          };
        });
        
        // Find all metrics that have period data (start_date and end_date)
        const periodMetrics = Object.entries(filing.data).filter(([_, value]: [string, any]) => 
          value.start_date && value.end_date
        );
        
        // Group metrics by their base name (without unit and period suffixes)
        const metricGroups = new Map<string, Array<[string, any]>>();
        
        periodMetrics.forEach(([key, value]) => {
          // Extract base metric name by removing unit and period suffixes
          const baseName = key.replace(/_[A-Z]+(_period)?$/, '');
          if (!metricGroups.has(baseName)) {
            metricGroups.set(baseName, []);
          }
          metricGroups.get(baseName)?.push([key, value]);
        });
        
        // For each group of metrics, sort by date and add previous period data
        metricGroups.forEach((metrics, baseName) => {
          // Sort metrics by end_date (most recent first)
          metrics.sort((a, b) => {
            const dateA = a[1].end_date || a[1].date || '';
            const dateB = b[1].end_date || b[1].date || '';
            return dateB.localeCompare(dateA);
          });
          
          // If we have at least 2 metrics, use the second one as previous period
          if (metrics.length >= 2) {
            const [currentKey, currentValue] = metrics[0];
            const [previousKey, previousValue] = metrics[1];
            
            // Add previous period data with a consistent suffix
            result[`${currentKey}_previous`] = {
              value: previousValue.value,
              start_date: previousValue.start_date,
              end_date: previousValue.end_date,
              unit: previousValue.unit
            };
            
            console.log(`Added previous period data for ${baseName}:`, {
              current: currentValue,
              previous: previousValue
            });
          }
        });
        
        return result;
      };
      
      // Prepare the context for rule evaluation
      const ruleContext: RuleContext = {
        currentFiling: convertFilingToMetrics(currentFiling),
        ticker: filing.company && filing.company.cik ? String(filing.company.cik) : ''
      };
      
      // Get sector information if available
      if (company && company.name) {
        // In a real app, we might look up the sector from a database or API
        // For now, we'll just leave it undefined or could hardcode for testing
      }
      
      // Run rule evaluation
      const results = evaluateRules(ruleContext);
      setRuleResults(results);
      
    } catch (err) {
      console.error("Error evaluating SEC rules:", err);
    } finally {
      setLoadingRuleEvaluation(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto px-4 py-8 text-gray-600 dark:text-gray-300">Loading...</div>;
  }
  if (error) {
    return <div className="container mx-auto px-4 py-8 text-red-600 dark:text-red-400">{error}</div>;
  }
  if (!filing) return null;

  const dataEntries = Object.entries(filing.data as Record<string, any>);
  const assets = dataEntries.find(([key]) => key.startsWith('Assets_'));
  const liabilities = dataEntries.find(([key]) => key.startsWith('Liabilities_'));
  const equity = dataEntries.find(([key]) => key.startsWith('StockholdersEquity_'));
  const revenue = dataEntries.find(([key]) => key.startsWith('RevenueFromContractWithCustomerExcludingAssessedTax_'));
  const netIncome = dataEntries.find(([key]) => key.startsWith('NetIncomeLoss_'));
  const eps = dataEntries.find(([key]) => key.startsWith('EarningsPerShareBasic_'));
  const cash = dataEntries.find(([key]) => key.startsWith('CashAndCashEquivalentsAtCarryingValue_'));
  const currentAssets = dataEntries.find(([key]) => key.startsWith('AssetsCurrent_'));
  const currentLiabilities = dataEntries.find(([key]) => key.startsWith('LiabilitiesCurrent_'));
  const operatingIncome = dataEntries.find(([key]) => key.startsWith('OperatingIncomeLoss_'));
  const grossProfit = dataEntries.find(([key]) => key.startsWith('GrossProfit_'));
  const costOfRevenue = dataEntries.find(([key]) => key.startsWith('CostOfRevenue_')) || 
                dataEntries.find(([key]) => key.startsWith('CostOfGoodsAndServicesSold_')) || 
                dataEntries.find(([key]) => key.startsWith('CostOfGoodsSold_'));
  const rnd = dataEntries.find(([key]) => key.startsWith('ResearchAndDevelopmentExpense_'));
  const sga = dataEntries.find(([key]) => key.startsWith('SellingGeneralAndAdministrativeExpense_'));
  const shares = dataEntries.find(([key]) => key.startsWith('WeightedAverageNumberOfSharesOutstandingBasic_'));
  const dividends = dataEntries.find(([key]) => key.startsWith('DividendsPaid_'));
  const cikStr = filing.company && filing.company.cik ? String(filing.company.cik) : '';
  const secLink = filing.accession_number && cikStr
    ? `https://www.sec.gov/Archives/edgar/data/${cikStr.replace(/^0+/, '')}/${filing.accession_number.replace(/-/g, '')}/${filing.accession_number}-index.htm`
    : null;

  // Extract all available metrics for this filing from the complete dataset
  const renderAllAvailableMetrics = () => {
    if (loadingAllMetrics) {
      return (
        <div className="mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg shadow p-6">
          <div className="text-center text-gray-600 dark:text-gray-300">
            <div className="inline-block animate-spin mr-2 h-4 w-4 border-t-2 border-blue-500 border-r-2 border-b-2 border-gray-200 rounded-full"></div>
            Loading complete filing data...
          </div>
        </div>
      );
    }
    
    if (!allMetrics.facts || !allMetrics.cik) {
      return null;
    }

    // Define categories for organizing metrics
    type MetricCategory = {
      title: string;
      metrics: Record<string, any>;
      pattern: RegExp;
    };

    const categories: MetricCategory[] = [
      { 
        title: "Balance Sheet", 
        metrics: {},
        pattern: /^(Assets|Liabilities|Stockholders|Equity|Debt|Payable|Receivable|Cash|Investment|Property|Inventory|Prepaid|Accrued|Current)/i 
      },
      { 
        title: "Income Statement", 
        metrics: {},
        pattern: /^(Revenue|Income|Loss|Expense|Earnings|Profit|Cost|Tax|Operating|Sales)/i 
      },
      { 
        title: "Cash Flow", 
        metrics: {},
        pattern: /^(CashFlow|NetCash|Cash\w*Provided|Cash\w*Used|Financing|Investing)/i 
      },
      { 
        title: "Per Share Data", 
        metrics: {},
        pattern: /PerShare|SharesOutstanding|Dividend|WeightedAverage/i 
      },
      { 
        title: "Other Metrics", 
        metrics: {},
        pattern: /./ // Catch-all pattern
      }
    ];
    
    // Find all metrics available for this filing
    const allAvailableMetrics: Record<string, any> = {};
    
    try {
      // Process us-gaap taxonomy
      if (allMetrics.facts['us-gaap']) {
        Object.entries(allMetrics.facts['us-gaap']).forEach(([concept, data]: [string, any]) => {
          // Use type assertion to handle the units properly
          Object.entries(data.units || {}).forEach(([unitType, units]) => {
            // Ensure units is treated as an array
            (units as any[]).forEach(unit => {
              if (unit.form === '10-Q' && unit.accn === accession) {
                const key = `${concept}_${unitType}${unit.start ? '_period' : ''}`;
                allAvailableMetrics[key] = {
                  concept,
                  unitType,
                  value: unit.val,
                  start_date: unit.start,
                  end_date: unit.end,
                  date: unit.end,
                  unit: unitType
                };
              }
            });
          });
        });
      }
    } catch (err) {
      console.error("Error processing metrics:", err);
    }

    // If no additional metrics found
    if (Object.keys(allAvailableMetrics).length === 0) {
      return (
        <div className="mt-4 bg-yellow-50 dark:bg-yellow-900/10 p-4 rounded-md">
          <p className="text-yellow-700 dark:text-yellow-400">No additional metrics available for this filing.</p>
        </div>
      );
    }

    // Categorize metrics
    Object.entries(allAvailableMetrics).forEach(([key, metric]) => {
      let placed = false;
      
      // Try to place the metric in a specific category based on its name
      for (let i = 0; i < categories.length - 1; i++) {
        if (categories[i].pattern.test(metric.concept)) {
          categories[i].metrics[key] = metric;
          placed = true;
          break;
        }
      }
      
      // If not placed in any specific category, add to "Other Metrics"
      if (!placed) {
        categories[categories.length - 1].metrics[key] = metric;
      }
    });

    // Remove empty categories
    const nonEmptyCategories = categories.filter(category => 
      Object.keys(category.metrics).length > 0
    );

    return (
      <div className="mt-6 space-y-6">
        <h3 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">Complete SEC Filing Metrics</h3>
        
        {nonEmptyCategories.map((category, index) => (
          <div key={index} className="bg-gray-50 dark:bg-gray-800 rounded-lg shadow p-6">
            <h4 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-200 border-b border-gray-300 dark:border-gray-700 pb-2">
              {category.title}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
              {Object.entries(category.metrics).map(([key, metric]) => {
                const { display, original } = getMetricDisplayName(metric.concept);
                return (
                  <div key={key} className="border border-gray-200 dark:border-gray-700 rounded-md p-2 overflow-hidden hover:bg-gray-100 dark:hover:bg-gray-700/30">
                    <div className="truncate relative">
                      <span className="font-medium text-gray-500 dark:text-gray-400">
                        {display}
                        <Tooltip content={original} size="md" />
                      </span>
                    </div>
                    <div className="mt-1">
                      <span className="text-gray-900 dark:text-gray-50 font-semibold">
                        {typeof metric.value === 'number' 
                          ? (metric.unitType === 'USD' ? formatLargeNumber(metric.value) : metric.value.toLocaleString())
                          : metric.value}
                      </span>
                      {metric.start_date && (
                        <span className="text-xs text-gray-500 ml-2">
                          ({new Date(metric.start_date).toLocaleDateString()} - {new Date(metric.end_date).toLocaleDateString()})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">{filing.company.name} SEC Filing Details</h1>
      {company && (
        <div className="mb-4">
          <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{company.name}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">CIK: {company.cik}</div>
        </div>
      )}
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg shadow p-6 mb-4">
        <div className="flex flex-wrap items-center justify-between mb-2">
          <div className="font-semibold text-gray-900 dark:text-gray-100 text-base">
            {filing.fiscal_period} {filing.fiscal_year} Filing
          </div>
          {secLink && (
            <a href={secLink} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-xs ml-2">
              SEC Filing ↗
            </a>
          )}
        </div>
        <div className="text-sm text-gray-700 dark:text-gray-200">
          <span className="mr-4">Filing Date: <span className="font-medium">{new Date(filing.filing_date).toLocaleDateString()}</span></span>
          <span className="mr-4">Report Date: <span className="font-medium">{new Date(filing.report_date).toLocaleDateString()}</span></span>
          <span>Accession #: <span className="font-mono text-xs">{filing.accession_number}</span></span>
        </div>
      </div>
      
      {/* SEC Filing Rule Evaluation Results */}
      <SECRuleEvaluation 
        ruleResults={ruleResults} 
        isLoading={loadingRuleEvaluation} 
      />
      
      {renderAllAvailableMetrics()}
    </div>
  );
};

export default SecDetails; 