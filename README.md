# Market Portfolio Management V2

A modern web application for managing investment portfolios, tracking transactions, and analyzing performance.

## Features

### Portfolio Management
- Real-time portfolio tracking and performance visualization
- Detailed position-level analysis and drill-down capabilities
- Transaction management with lot tracking and editing
- Sector allocation analysis with interactive drill-down
- Portfolio visualization with multiple chart types
- Dark/light mode support
- Responsive design

### Analysis Tools
- Price history charts with technical indicators
- Portfolio performance analysis with multiple metrics
- Modern Portfolio Theory (MPT) modeling
- Results explorer for in-depth analysis
- Dividend predictions and analysis
- Buy recommendations based on portfolio analysis

### Transaction Management
- Comprehensive transaction tracking
- Lot management system
- Potential lots analysis
- Transaction editing capabilities
- Position details and history

### Charts and Visualizations
- Return charts
- Market value charts
- Sector allocation charts
- Portfolio performance charts
- Symbol weight distribution
- Price history visualization

### Automation
- Automated background tasks via scheduler
- Real-time portfolio updates
- Automated price updates
- Customizable scheduler settings

## Technology Stack

- Frontend: React with TypeScript
- UI: Tailwind CSS
- Charts: Recharts
- Backend API: RESTful service (included in this repository)
- Scheduler: APScheduler (Python)

## Scheduler Functionality

The application includes a background task scheduler (using APScheduler) that automates key portfolio management tasks. Example scheduled jobs:

- **update_overamt**: Runs every 5 minutes during US market hours (9:00 AM - 4:00 PM ET, weekdays only) to update portfolio metrics.
- **price_updater**: Runs daily at 9:35 AM ET on weekdays to update stock prices.

You can check the scheduler status and view registered jobs by visiting:
```
http://localhost:8000/scheduler/status
```

Scheduler activity is also logged in the backend logs.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Python 3.8+ (for backend and scheduler)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/mpmv2.git
   cd mpmv2
   ```

2. Install frontend dependencies:
   ```bash
   npm install
   ```

3. Install backend dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   cd ..
   ```

4. Start the backend API and scheduler:
   ```bash
   cd backend
   python run.py
   # or
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   cd ..
   ```

5. Start the frontend development server:
   ```bash
   npm start
   ```

The application will be available at `http://localhost:3000`.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Created by Mike Roetto <mike@roetto.org>
- With assistance from Claude (Anthropic)
