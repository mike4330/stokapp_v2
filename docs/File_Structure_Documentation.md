# Market Portfolio Management V2 - File Structure Documentation

## Root Directory
- **README.md**: Main project overview and setup instructions.
- **LICENSE**: GNU General Public License v3.0 file.
- **.gitignore**: Git ignore file for excluding build artifacts and dependencies.
- **Directories**:
  - **frontend/**: Contains the React-based frontend application.
  - **backend/**: Contains the Python FastAPI backend and scheduler.
  - **docs/**: Documentation for the project.
  - **static/**: Static assets (contents not fully explored).
  - **cron_migration/**: Likely related to legacy cron job migration (contents not fully explored).
  - **node_modules/**: Node.js dependencies (contents not fully explored).
  - **.git/**: Git repository data (contents not fully explored).

## Frontend Directory (`frontend/`)
- **Key Files**:
  - **package.json**: Frontend dependencies and scripts.
  - **tailwind.config.js**: Tailwind CSS configuration.
  - **tsconfig.json**: TypeScript configuration.
  - **postcss.config.js**: PostCSS configuration.
- **Directories**:
  - **src/**: Source code for the React application.
  - **public/**: Public assets and HTML template (contents not fully explored).
  - **build/**: Build output (contents not fully explored).
  - **resources/**: Additional resources (contents not fully explored).
  - **reference_code/**: Reference or legacy code (contents not fully explored).
  - **node_modules/**: Frontend dependencies (contents not fully explored).

### Frontend Source (`frontend/src/`)
- **Key Files**:
  - **App.tsx**: Main application component.
  - **index.tsx**: Entry point for the React app.
  - **index.css**: Global CSS styles.
  - **App.css**: Styles specific to the App component.
  - **logo.svg**: Application logo.
  - **reportWebVitals.ts**: Performance monitoring setup.
  - **setupTests.ts**: Testing setup.
- **Directories**:
  - **pages/**: Contains page components (e.g., MPTModelling.tsx).
  - **components/**: Reusable UI components.
  - **utils/**: Utility functions and helpers.
  - **hooks/**: Custom React hooks.

## Backend Directory (`backend/`)
- **Key Files**:
  - **README.md**: Backend-specific documentation.
  - **requirements.txt**: Python dependencies.
  - **run.py**: Script to start the backend server.
  - **app.log**: Application log file.
  - **nohup.out**: Output from nohup command (if used).
  - **yfinance.cache**: Cache file for Yahoo Finance data.
  - **test.py**: Test script.
- **Directories**:
  - **app/**: Core backend application code.
  - **data/**: Data storage (contents not fully explored).
  - **model_repository/**: Model storage or management (contents not fully explored).
  - **venv/**: Virtual environment for Python (contents not fully explored).
  - **static/**: Static files for backend (contents not fully explored).

### Backend Application (`backend/app/`)
- **Key Files**:
  - **main.py**: Main FastAPI application file.
  - **mpt_modeling.py**: Handles MPT optimization tasks and API endpoints.
  - **portfolio_optimization.py**: Core engine for portfolio optimization algorithms.
  - **pricedataset.csv**: Historical price data storage.
  - **model_repository.py**: Manages model storage or retrieval.
- **Directories**:
  - **api/**: API endpoint definitions.
  - **services/**: Backend services and business logic.
  - **schemas/**: Data models and schemas.
  - **utils/**: Utility functions.
  - **scheduler/**: Background task scheduler setup (APScheduler).
  - **routes/**: API route definitions.
  - **models/**: Database or data models.
  - **core/**: Core application logic or configuration.
  - **db/**: Database-related code.
  - **logs/**: Log storage.
  - **config/**: Configuration files (e.g., tickers.txt, sectormap.txt).
  - **__pycache__/**: Python cache files (contents not fully explored).

## Documentation Directory (`docs/`)
- **Key Files**:
  - **MPT_System_Documentation.md**: Comprehensive documentation for the MPT Modeling System.
  - **forecast-calculation.md**: Documentation related to forecast calculations.
  - **portfolio-tracker-project-doc.md**: Detailed project documentation for the portfolio tracker.
  - **schema.txt**: Likely a reference for data or API schemas.
  - **sec_data_enrichment.md**: Documentation for the SEC data retrieval and display system.
  - **sec_data_technical_notes.md**: Technical implementation details for the SEC data system.
  - **sec_rule_evaluation.md**: Documentation for the SEC financial red flag detection system.
- **Directories**:
  - **components/**: Documentation for specific components (contents not fully explored).
  - **api/**: API-specific documentation (contents not fully explored).
  - **diagrams/**: Diagrams and visual aids (contents not fully explored).

## Summary
The `mpmv2` project is structured with a clear separation between frontend (React/TypeScript) and backend (Python/FastAPI) components. The frontend handles user interface and interaction, while the backend manages data processing, portfolio optimization, and automated tasks via a scheduler. Documentation is centralized in the `docs` directory, providing detailed insights into various aspects of the system. This structure supports the project's goal of providing a modern web application for investment portfolio management with real-time tracking, analysis tools, and automation. 