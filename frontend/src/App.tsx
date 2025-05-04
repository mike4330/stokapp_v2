/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Transactions from './pages/Transactions';
import Holdings from './pages/Holdings';
import PositionInfo from './pages/PositionInfo';
import SectorAllocationChart from './components/SectorAllocationChart';
import BuyRecommendations from './pages/BuyRecommendations';
import MPTModelling from './pages/MPTModelling';
import ResultsExplorer from './pages/ResultsExplorer';
import SchedulerSettings from './pages/SchedulerSettings';
import PortfolioPerformancePage from './pages/PortfolioPerformancePage';
import PortfolioVisualization from './pages/PortfolioVisualization';
import PotentialLots from './pages/PotentialLots';
import LotManagerPage from './pages/LotManagerPage';
import AllocationGrid from './pages/AllocationGrid';
import './App.css';

// Placeholder components for routes
const DividendCharts = () => <div className="p-4">Dividend History Charts</div>;

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
        <div className="sticky top-0 z-50">
          <Navbar />
        </div>
        <main className="app-container mx-auto py-8">
          <Routes>
            <Route path="/" element={<Holdings />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/holdings" element={<Holdings />} />
            <Route path="/positions/:symbol" element={<PositionInfo />} />
            <Route path="/modelling/mpt" element={<MPTModelling />} />
            <Route path="/modelling/results-explorer" element={<ResultsExplorer />} />
            <Route path="/modelling/recommendations" element={<BuyRecommendations />} />
            <Route path="/potential-lots" element={<PotentialLots />} />
            <Route path="/lot-manager" element={<LotManagerPage />} />
            <Route path="/charts/portfolio" element={<PortfolioPerformancePage />} />
            <Route path="/charts/sector" element={<SectorAllocationChart />} />
            <Route path="/charts/sunburst" element={<PortfolioVisualization />} />
            <Route path="/charts/dividends" element={<DividendCharts />} />
            <Route path="/charts/allocation" element={<AllocationGrid />} />
            <Route path="/settings/scheduler" element={<SchedulerSettings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
