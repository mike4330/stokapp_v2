# Stock Portfolio Tracker Redesign Project Document

## Current System Overview

### Tech Stack
- **Backend**: PHP
- **Database**: SQLite
- **Data Processing**: Various shell and Python scripts (both scheduled and manual)
- **Visualization**: Chart.js
- **Data Analysis**: Python libraries (pandas, pandas_ta, PyPortfolioOpt)
- **Market Data**: Yahoo Finance API via yfinance library
- **Scheduling**: Cron jobs for various tasks

### Scripts and Automation
1. **Data Collection**
   - `loopprices.py`: Fetches current stock prices from Yahoo Finance during market hours
   - `getxag.py`: Likely retrieves silver prices (physical asset tracking)
   - `download.py`: Downloads end-of-day data

2. **Data Processing**
   - `movingaverages.sh`: Calculates 50-day and 200-day moving averages, volatility metrics, and other statistics
   - `rsi.py`: Calculates Relative Strength Index (RSI) for stocks
   - `hist2.sh`: Updates historical position values, calculates net units, cost basis, and cumulative dividends

3. **Portfolio Optimization**
   - `opt3.py`: Implements Modern Portfolio Theory optimization with sector constraints
   - `currentmodel`: Wrapper script that runs the portfolio optimization process with specific parameters

4. **Data Backup and Maintenance**
   - Regular SQLite database backups (every 30 minutes)
   - Various synchronization tasks (syncaws.sh)

### Key Functionality
1. **Multi-asset Portfolio Tracking**
   - Supports multiple brokerages
   - Tracks physical assets (e.g., silver via XAG)
   - Maintains a comprehensive transaction ledger
   - Records all transaction types (Buy, Sell, Dividend) in a unified system

2. **Portfolio Analysis**
   - Calculates P/L (Profit/Loss)
   - Tracks positions and their current values
   - Records cost basis per share (CBPS)
   - Tracks cumulative dividends and realized gains/losses
   - Computes technical indicators (moving averages, RSI, volatility)
   - Maintains historical security values over time

3. **Modern Portfolio Theory (MPT) Implementation**
   - Generates efficient frontier visualizations
   - Implements sector-based constraints and allocations
   - Calculates covariance matrices and correlation reports
   - Produces optimal portfolio weights based on risk parameters
   - Generates buy/sell recommendations to maintain portfolio balance

4. **Visualization**
   - Dividend tracking over time
   - Overall returns
   - Cost basis tracking
   - Position sizes and values
   - Technical indicators and statistical metrics

## Current Database Schema

The database contains the following key tables:

1. **prices**: Stores current price data and technical indicators for each security
   - Includes price, lastupdate, volatility metrics, moving averages, etc.

2. **transactions**: Core transaction ledger
   - Records all buys, sells, dividends with details on price, units, gain/loss
   - Includes lot tracking (units_remaining)
   - Contains fields for tax handling (term, disposition)

3. **security_values**: Historical position values and metrics
   - Tracks share count, cost basis, cumulative dividends, returns
   - Allows time-series analysis of positions

4. **MPT**: Modern Portfolio Theory data
   - Stores target allocations, sector information, technical metrics
   - Contains RSI values, PE ratios, dividend yields

5. **weights**: Stores historical portfolio weights
   - Records optimization results over time
   - Tracks target vs. actual allocations

6. **historical**: Time series data for portfolio performance
   - Contains various moving averages and metrics
   - Tracks returns over different time periods

7. **Other supporting tables**:
   - aux_attributes: Additional security metadata
   - asset_classes, sectors: Classification data
   - dividends: Dividend history
   - open_lots (view): Shows available lots for tax-lot selling

## Current UI and Workflow

Based on the screenshots provided, the current application includes:

1. **Main Holdings View**:
   - Tabular display of all positions with key metrics
   - Color-coded indicators for performance
   - Column-based layout with extensive data display

2. **Transaction Entry**:
   - Form-based interface for entering buys, sells, and dividends
   - Account selection and date pickers
   - Transaction listing with filtering

3. **Security Detail View**:
   - Transaction history for individual securities
   - Multiple chart visualizations (price history, returns, yield)
   - Summary statistics and lot information
   - Cost basis tracking vs. price

4. **Sector Allocation View**:
   - Target vs. current weight comparison
   - Multi-chart display of sector performance over time
   - Difference highlighting for rebalancing needs
   - Pie chart visualization of sector composition

5. **Chart Displays**:
   - Security price history in grid layout
   - Dividend tracking (monthly amounts and quarterly totals)
   - Portfolio value vs. cost with multiple moving averages
   - Target vs. actual allocation over time for individual securities

## Visualization Capabilities

Based on the screenshots provided, the application includes extensive visualization features:

1. **Security Price History**:
   - Individual security price charts with area-style visualization
   - Grid layout for viewing multiple securities simultaneously
   - Upcoming dividend notifications

2. **Portfolio Performance**:
   - Value vs. cost comparisons over time
   - Dividend income tracking (monthly and quarterly breakdowns)
   - Multiple moving averages for returns analysis
   - Portfolio growth visualization

3. **Sector Allocation**:
   - Pie charts showing composition within each sector
   - Color-coded security representation
   - Visual breakdown of portfolio by sector

4. **Individual Security Charts**:
   - Historical price data with consistent styling
   - Different color schemes per security
   - Time-based comparison across securities

5. **Sector Performance Comparison**:
   - Multi-line charts comparing returns within sectors
   - Color-coded performance tracking
   - Relative return visualization across sectors

6. **Target vs. Actual Allocation**:
   - Area charts showing target (black line) vs. actual allocations
   - Historical weight tracking
   - Visual indicators for over/under-allocation

These visualizations serve several key purposes:

- Performance tracking at security and sector levels
- Allocation monitoring against target weights
- Dividend income analysis
- Historical trend identification
- Rebalancing decision support

## Common User Tasks

The most frequent operations in the current system:

1. **Transaction Entry**:
   - Recording buys, sells, and dividends
   - Manual entry of transaction details

2. **Portfolio Monitoring**:
   - Checking sector and individual security weights
   - Monitoring portfolio balance against targets

3. **Manual Database Operations**:
   - Direct database edits for specific operations
   - Closing individual lots and entering P/L for sell transactions

## Identified Issues and Pain Points

### Specific Pain Points
1. **CSS/UI Issues**: 
   - Visualization-rich screens with poor CSS implementation
   - Difficulty creating elegant UI solutions manually
   - AI assistance hasn't significantly improved the situation

2. **Database Concurrency Issues**:
   - SQLite concurrency limitations, especially with background shell scripts (like loopprices.py)
   - Data update conflicts while using the application
   - Multiple scripts (e.g., hist2.sh, movingaverages.sh) accessing the database sequentially

3. **Fragmented Data Processing**:
   - Reliance on numerous shell scripts running at scheduled times (via cron)
   - Mix of PHP, Python, and shell scripts for different parts of the system
   - Manual intervention required for some processes
   - Potential maintenance issues with scripts dependent on specific system configurations

4. **Integration Issues**:
   - Lot management not implemented (important for specific lot trading)
   - MPT (Modern Portfolio Theory) optimization process not integrated into the application
   - External optimization process (opt3.py) not directly accessible through the UI
   - Complex workflow involving multiple scripts (currentmodel, opt3.py, etc.)

## Implementation Considerations
- Personal project running on localhost
- Continue using SQLite as the database with improved concurrency handling
- Must be accessible remotely via a browser
- Minimize maintenance overhead and dependencies
- Application should auto-start and recover after reboots
- No separate daemons or services requiring regular maintenance

## Recommended Technology Stack

After careful consideration of mainstream adoption, development efficiency, and specific application requirements, the following technology stack is recommended:

### Backend: Python with FastAPI
- **Reasons for Selection**:
  - Excellent integration with data analysis libraries (pandas, numpy, pypfopt)
  - Strong mainstream adoption for financial and data-intensive applications
  - Highly LLM-friendly for AI-assisted development
  - Excellent performance characteristics
  - Growing ecosystem and community support
  - More future-proof for analytical applications

- **Implementation Approach**:
  - FastAPI for API development and request handling
  - Pydantic for data validation and settings management
  - APScheduler for replacing cron jobs with internal task scheduling
  - SQLAlchemy for database access layer (with proper transaction handling)
  - Packaging as a systemd user service for auto-start capabilities

### Frontend: React
- **Reasons for Selection**:
  - Largest component ecosystem for rich UI development
  - Maximum "bells and whistles" available through extensive libraries
  - Most mainstream adoption and community support
  - Excellent for LLM-assisted "vibe coding"
  - Strong visualization library options (Recharts, Visx)

- **Resource Optimization Approach**:
  - Code splitting to minimize initial bundle size
  - Careful dependency management to avoid bloat
  - Performance monitoring and optimization
  - Memoization and virtualization for handling large datasets
  - Static pre-rendering where possible

### Visualization: Recharts with D3.js
- Primary visualizations using Recharts for performance
- Complex custom visualizations using D3.js when needed
- Server-side generation of complex visualizations (efficient frontier, etc.)

### CSS Framework: Tailwind CSS
- Utility-first approach pairs well with React and LLM development
- Excellent for creating consistent UI with minimal effort
- Strong design system capabilities
- Good performance characteristics with proper setup

## Recommended Architecture

### Database
1. **Enhanced SQLite Implementation**
   - Enable WAL (Write-Ahead Logging) mode to improve concurrency
   - Implement proper connection pooling and transaction management
   - Add retry logic for handling concurrent write operations
   - Consider using SQLite extensions for additional functionality (if needed)
   - Implement proper backup routines (continuing current approach)

2. **Database Access Layer**
   - Create a unified data access service that handles all database operations
   - Implement proper locking mechanisms for critical operations
   - Use transactions consistently across the application
   - Separate read and write operations where possible

### Application Framework
1. **Web-based Application with Internal Task Scheduling**
   - **Backend**: Python with FastAPI
     - Packaged as a standalone application
     - Auto-starts on system boot via systemd user service
     - Includes internal task scheduler to replace cron jobs
   - **Frontend**: React
     - Pre-compiled static assets 
     - Modern component-based architecture
     - Responsive design for various screen sizes

2. **Background Process Management**
   - Replace current cron jobs with application-managed scheduled tasks
   - Implement a task queue for managing data updates
   - Add proper logging and error handling
   - Ensure graceful shutdown and restart capabilities

3. **Deployment Strategy**
   - Single-command installation/update process
   - Automatic startup on reboot (systemd user service)
   - Configuration stored in easily editable files
   - Development/production environment separation

### Modernization Approach
1. **Core Services Layer**
   - Data fetching service (replacing loopprices.py and other data collection scripts)
   - Analysis service (replacing rsi.py, movingaverages.sh, etc.)
   - Portfolio optimization service (integrating opt3.py functionality)
   - Notification service for alerts and updates

2. **UI Modernization**
   - Component-based dashboard with drag-and-drop customization
   - Modern data visualization library (recharts, D3.js, Apache ECharts)
   - Consistent styling system using CSS framework (Tailwind)
   - Responsive layouts for different devices

3. **Integration of Missing Features**
   - Lot management system integrated directly into the application
   - MPT optimization tools accessible through the UI
   - Enhanced visualization tools for portfolio analysis
   - Improved user workflow for common tasks

## UI/UX Improvement Areas

Based on the screenshots and information provided:

1. **Transaction Entry**:
   - Need for streamlined data entry process
   - Better lot management interface for closing specific lots
   - Automated P/L calculation for sell transactions

2. **Visualization Consistency**:
   - Standardized chart styling and colors
   - More intuitive layout for comparative data
   - Responsive design for different screen sizes

3. **User Flow Optimization**:
   - Reduce navigation steps for common tasks
   - Integrate lot management directly into the interface
   - Automate tasks currently requiring manual DB edits

## Implementation Plan

### Phase 1: Foundation and Database Optimization
1. **SQLite Optimization** ✅
   - Enable WAL mode and configure for better concurrency
   - Implement proper transaction management
   - Add connection handling improvements
   - Test with simulated concurrent operations

2. **Create Core Backend Structure** ✅
   - Set up FastAPI project structure
   - Implement data access layer with proper error handling
   - Create initial API endpoints for basic data retrieval
   - Set up automated startup via systemd user service

3. **Database Models and API Foundation** ✅
   - Create SQLAlchemy models mapped to existing schema
   - Implement basic CRUD operations
   - Build initial API endpoints for portfolio data
   
4. **Implement Task Scheduler** ✅
   - Develop internal scheduler to replace cron jobs
   - Configure schedules based on US market hours
   - Set up placeholder tasks for data updates
   - Add scheduler status monitoring endpoint

### Phase 2: Core UI and Transaction Management
1. **React Application Foundation** ✅
   - Set up React application with TypeScript
   - Create component library with Tailwind CSS
   - Implement responsive layouts
   - Design navigation and core screens

2. **Transaction Management UI** ✅
   - Create enhanced transaction entry interface
   - Implement lot selection for sell transactions
   - Build dividend entry and management
   - Design transaction history views

3. **Lot Management Implementation** 🚧
   - Design improved lot tracking UI
   - Implement automatic P/L calculation
   - Create lot performance visualization
   - Add tax optimization suggestions

### Phase 3: Portfolio Visualization and Analysis
1. **Holdings and Performance Views** ✅
   - Implement main portfolio view with filtering
   - Create interactive performance charts
   - Build position detail screens with enhanced visualizations
   - Add comparative metrics and benchmarks

2. **Sector and Allocation Analysis** ✅
   - Create sector allocation dashboard
   - Implement target vs. actual weight comparison
   - Build rebalancing suggestions
   - Design historical allocation tracking

3. **Modern Portfolio Theory Integration** 🚧
   - Port optimization algorithms from opt3.py
   - Create interactive efficient frontier visualization
   - Implement sector constraint management
   - Design optimization parameter controls

### Phase 4: Data Collection and Background Services
1. **Data Collection Services** 📋
   - Implement stock price data collection (replacing loopprices.py)
   - Create metal prices data collector (replacing getxag.py)
   - Add history tracking and data validation
   - Implement rate limiting and error handling

2. **Analysis Services** 📋
   - Implement technical indicator calculations (replacing movingaverages.sh, rsi.py)
   - Create portfolio statistics service (replacing portstats2.php)
   - Add historical data processing (replacing hist2.sh)
   - Implement proper caching for expensive calculations

3. **Integration and Testing** 📋
   - Comprehensive testing of all components
   - Performance optimization
   - Documentation
   - Migration path from old system

## Implementation Progress

### Completed Items ✅
1. **Project Setup**
   - Basic project structure established and cleaned up
   - Frontend and backend properly separated
   - Git repository initialized with proper .gitignore
   - Configuration files properly organized in respective directories

2. **Frontend Foundation**
   - React application created with TypeScript
   - Tailwind CSS integrated and configured
   - Basic component structure established
   - Modern UI framework with responsive design implemented
   - Frontend configuration consolidated in frontend directory
   - Key component development:
     - Navigation bar with dark/light mode toggle
     - Holdings page showing portfolio overview
     - Position details page with transaction history
     - Transaction form with editing capabilities
     - Price history charting with technical indicators
     - Sector allocation visualization
     - Initial modelling recommendation UI

3. **Backend Foundation**
   - FastAPI application structure created
   - Database models mapped to existing schema
   - SQLite configured with WAL mode for better concurrency
   - Core API endpoints implemented:
     - /api/holdings - Portfolio overview
     - /api/holdings/{symbol} - Individual holding details 
     - /api/transactions - Transaction management
     - /api/sector-allocation - Portfolio allocation data
     - /api/positions/{symbol} - Detailed position information
     - /api/model-recommendations - Portfolio model recommendations
   - CORS configuration set up
   - Health check endpoint available
   - SQLite database connection with proper session management

4. **Development Environment**
   - Python virtual environment configured
   - Node.js dependencies properly organized in frontend directory
   - Development scripts created
   - Hot-reloading enabled for both frontend and backend
   - Project documentation updated for clarity

### In Progress 🚧
1. **Data Processing Components**
   - Market data integration 
   - Transaction processing and lot management
   - Position valuation calculations
   - Portfolio statistics generation

2. **Visualization Enhancements**
   - Enhanced chart visualizations
   - Interactive data exploration
   - Comparative analysis views

3. **Project Structure Optimization**
   - Cleanup of legacy configuration files
   - Organization of shared static assets
   - Documentation updates for LLM compatibility

### Pending Items 📋
1. **Background Processing**
   - Data collection automation
   - Portfolio optimization integration
   - Automated calculation of technical indicators

2. **Data Synchronization**
   - Data integrity mechanisms
   - Backup system implementation
   - Historical data management

3. **Advanced Features**
   - Portfolio optimizer integration
   - Tax lot optimization
   - Enhanced reporting capabilities
   - Notifications and alerts

## Current Project Structure

The project follows a clean separation of concerns with the following structure:

```
mpmv2/
├── backend/                # FastAPI backend
│   ├── app/               # Core application code
│   ├── data/              # Data storage and cache files
│   ├── static/            # Static files
│   ├── requirements.txt   # Python dependencies
│   ├── run.py            # Application entry point
│   └── test.py           # Test suite
├── frontend/              # React frontend
│   ├── src/              # Source code
│   ├── public/           # Public assets
│   ├── build/            # Production build
│   ├── resources/        # Frontend resources
│   └── reference_code/   # Code references and examples
├── docs/                 # Project documentation
└── static/               # Shared static assets
```

This structure provides:
- Clear separation between frontend and backend
- Proper organization of configuration files
- Centralized documentation
- Efficient development workflow
- LLM-friendly organization for AI-assisted development

## Next Steps

1. **Immediate Priority**
   - Complete cleanup of any remaining legacy configuration files
   - Ensure all frontend dependencies are properly managed
   - Update documentation for better LLM compatibility

2. **Short Term**
   - Implement remaining data processing components
   - Enhance visualization capabilities
   - Complete lot management system

3. **Medium Term**
   - Integrate background processing
   - Implement data synchronization
   - Add advanced features

4. **Long Term**
   - Performance optimization
   - Enhanced AI integration
   - Additional portfolio analysis features