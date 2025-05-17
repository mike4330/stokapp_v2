/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Transactions from './pages/Transactions';
import Holdings from './pages/Holdings';
import PositionInfo from './pages/PositionInfo';
import SectorAllocationChart from './components/SectorAllocationChart';
import MPTModelling from './pages/MPTModelling';
import ResultsExplorer from './pages/ResultsExplorer';
import SchedulerSettings from './pages/SchedulerSettings';
import PortfolioPerformancePage from './pages/PortfolioPerformancePage';
import PortfolioVisualization from './pages/PortfolioVisualization';
import PortfolioBalance from './pages/PortfolioBalance';
import LotManagerPage from './pages/LotManagerPage';
import AllocationGrid from './pages/AllocationGrid';
import PortfolioAnalyzer from './pages/PortfolioAnalyzer';
import DividendPredictions from './pages/DividendPredictions';
import PortfolioDetails from './pages/PortfolioDetails';
import DividendCalendar from './pages/DividendCalendar';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './App.css';
import IncomeCharts from './pages/IncomeCharts';
import SecurityManagement from './pages/SecurityManagement';

// Placeholder components for routes
const DividendCharts = () => <div className="p-4">Dividend History Charts</div>;

const COLORS = [
  '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28CFF', '#FF6699', '#33CC99', '#FF4444', '#FFB347', '#B6D7A8',
];

interface PieData {
  symbol: string;
  value: number;
}

function combineSmallSlices(data: PieData[], thresholdPercent: number): PieData[] {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const threshold = total * (thresholdPercent / 100);
  const large = data.filter(d => d.value >= threshold);
  const small = data.filter(d => d.value < threshold);
  if (small.length === 0) return data;
  const otherValue = small.reduce((sum, d) => sum + d.value, 0);
  return [
    ...large,
    { symbol: 'Other', value: otherValue },
  ];
}

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
            <Route path="/portfolio-details" element={<PortfolioDetails />} />
            <Route path="/positions/:symbol" element={<PositionInfo />} />
            <Route path="/modelling/mpt" element={<MPTModelling />} />
            <Route path="/modelling/results-explorer" element={<ResultsExplorer />} />
            <Route path="/portfolio-balance" element={<PortfolioBalance />} />
            <Route path="/lot-manager" element={<LotManagerPage />} />
            <Route path="/charts/portfolio" element={<PortfolioPerformancePage />} />
            <Route path="/charts/sector" element={<SectorAllocationChart />} />
            <Route path="/charts/sunburst" element={<PortfolioVisualization />} />
            <Route path="/charts/dividends" element={<DividendCharts />} />
            <Route path="/charts/income" element={<IncomeCharts />} />
            <Route path="/charts/allocation" element={<AllocationGrid />} />
            <Route path="/dividend-predictions" element={<DividendPredictions />} />
            <Route path="/dividend-calendar" element={<DividendCalendar />} />
            <Route path="/settings/scheduler" element={<SchedulerSettings />} />
            <Route path="/settings/securities" element={<SecurityManagement />} />
            <Route path="/analyze/:runId" element={<PortfolioAnalyzer />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
