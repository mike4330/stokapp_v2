/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * ButtonizedNavbar Component
 * 
 * Navigation bar with a modern, button-like appearance and enhanced visual effects.
 * Provides links to major sections with visual separation between items.
 * 
 * Reorganized for better logical flow:
 * 1. Portfolio Management (core functionality)
 * 2. Analysis & Charts (data visualization)
 * 3. Tools & Settings (utilities and configuration)
 * 4. Modelling (advanced analysis)
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Button Component to encapsulate shared styling
interface ButtonProps {
  children: React.ReactNode;
  to?: string; // For Link buttons
  onClick?: () => void; // For regular buttons
  className?: string; // For additional custom styles
  isDropdown?: boolean; // To adjust styling for dropdown buttons
}

const Button: React.FC<ButtonProps> = ({ children, to, onClick, className = '', isDropdown = false }) => {
  const baseClasses =
    'm-1 py-1 px-4 rounded-md bg-gradient-to-r from-gray-700 to-gray-600 text-white font-small shadow-md hover:from-indigo-900 hover:to-indigo-800 hover:scale-105 transition-all duration-200';
  const dropdownClasses = isDropdown ? 'inline-flex items-center' : '';

  if (to) {
    return (
      <Link to={to} className={`${baseClasses} ${dropdownClasses} ${className}`}>
        {children}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={`${baseClasses} ${dropdownClasses} ${className}`}>
      {children}
    </button>
  );
};

const ButtonizedNavbar: React.FC = () => {
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isModellingOpen, setIsModellingOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
             (window.matchMedia('(prefers-color-scheme: dark)').matches && 
              localStorage.getItem('darkMode') === null);
    }
    return false;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isAnalysisOpen || isToolsOpen || isModellingOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.dropdown-container')) {
          setIsAnalysisOpen(false);
          setIsToolsOpen(false);
          setIsModellingOpen(false);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAnalysisOpen, isToolsOpen, isModellingOpen]);

  return (
    <nav className="bg-gray-800 text-gray-100">
      <div className="max-w-full">
        <div className="flex flex-wrap">
          {/* Navigation Items as Buttons */}
          <div className="flex">
            {/* 1. PORTFOLIO MANAGEMENT - Core functionality */}
            <div className="flex border-r border-gray-600 pr-2">
              <Button to="/transactions">Transactions</Button>
              <Button to="/holdings">Holdings</Button>
              <Button to="/portfolio-balance">Portfolio Balance</Button>
              <Button to="/lot-manager">Lot Manager</Button>
            </div>
            
            {/* 2. ANALYSIS & CHARTS - Data visualization */}
            <div className="relative dropdown-container border-r border-gray-600 px-2">
              <Button
                onClick={() => {
                  setIsAnalysisOpen(!isAnalysisOpen);
                  setIsToolsOpen(false);
                  setIsModellingOpen(false);
                }}
                isDropdown
              >
                Analysis & Charts
                <svg
                  className="ml-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>

              {isAnalysisOpen && (
                <div className="absolute left-0 top-full mt-2 w-56 rounded-lg shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1" role="menu" aria-orientation="vertical">
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Portfolio Analysis
                    </div>
                    <Link
                      to="/charts/portfolio"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Portfolio Performance
                    </Link>
                    <Link
                      to="/charts/allocation"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Allocation Grid
                    </Link>
                    <Link
                      to="/charts/sector"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Sector Allocation
                    </Link>
                    <Link
                      to="/charts/sector-weights"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Sector Weights
                    </Link>
                    <div className="border-t border-gray-600 my-1"></div>
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Income Analysis
                    </div>
                    <Link
                      to="/charts/dividends"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Dividend History
                    </Link>
                    <Link
                      to="/dividend-calendar"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Dividend Calendar
                    </Link>
                    <Link
                      to="/dividend-predictions"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Dividend Predictions
                    </Link>
                    <Link
                      to="/charts/income"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsAnalysisOpen(false)}
                    >
                      Income Charts
                    </Link>
                  </div>
                </div>
              )}
            </div>
            
            {/* 3. TOOLS & SETTINGS - Utilities and configuration */}
            <div className="relative dropdown-container border-r border-gray-600 px-2">
              <Button
                onClick={() => {
                  setIsToolsOpen(!isToolsOpen);
                  setIsAnalysisOpen(false);
                  setIsModellingOpen(false);
                }}
                isDropdown
              >
                Tools & Settings
                <svg
                  className="ml-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>

              {isToolsOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-lg shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1" role="menu" aria-orientation="vertical">
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Reports
                    </div>
                    <Link
                      to="/settings/excess-lots"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      Excess Lots
                    </Link>
                    <div className="border-t border-gray-600 my-1"></div>
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Data Management
                    </div>
                    <Link
                      to="/settings/securities"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      Securities
                    </Link>
                    <div className="border-t border-gray-600 my-1"></div>
                    <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Automation
                    </div>
                    <Link
                      to="/settings/scheduler"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsToolsOpen(false)}
                    >
                      Scheduler
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* 4. MODELLING - Advanced analysis */}
            <div className="relative dropdown-container pl-2">
              <Button
                onClick={() => {
                  setIsModellingOpen(!isModellingOpen);
                  setIsAnalysisOpen(false);
                  setIsToolsOpen(false);
                }}
                isDropdown
              >
                Modelling
                <svg
                  className="ml-2 h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              </Button>

              {isModellingOpen && (
                <div className="absolute left-0 top-full mt-2 w-48 rounded-lg shadow-lg bg-gray-700 ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1" role="menu" aria-orientation="vertical">
                    <Link
                      to="/modelling/mpt"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsModellingOpen(false)}
                    >
                      MPT Modelling
                    </Link>
                    <Link
                      to="/modelling/results-explorer"
                      className="block px-4 py-2 text-sm text-gray-200 hover:bg-gray-600 hover:text-white rounded-md m-1 transition-colors duration-150"
                      role="menuitem"
                      onClick={() => setIsModellingOpen(false)}
                    >
                      Results Explorer
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Dark Mode Toggle on Desktop */}
          <div className="hidden md:flex items-center ml-auto pr-4">
            <Button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-full" // Override padding and shape for toggle
              aria-label="Toggle dark mode"
            >
              {isDarkMode ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu - collapsed by default */}
      <div className="md:hidden">
        <div className="pt-2 pb-3 space-y-2">
          {/* Portfolio Management */}
          <div className="border-b border-gray-600 pb-2">
            <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Portfolio Management
            </div>
            <Button to="/transactions" className="block mx-2">Transactions</Button>
            <Button to="/holdings" className="block mx-2">Holdings</Button>
            <Button to="/portfolio-balance" className="block mx-2">Portfolio Balance</Button>
            <Button to="/lot-manager" className="block mx-2">Lot Manager</Button>
          </div>
          
          {/* Analysis & Charts */}
          <div className="border-b border-gray-600 pb-2">
            <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Analysis & Charts
            </div>
            <Button to="/charts/portfolio" className="block mx-2">Portfolio Performance</Button>
            <Button to="/charts/allocation" className="block mx-2">Allocation Grid</Button>
            <Button to="/charts/sector" className="block mx-2">Sector Allocation</Button>
            <Button to="/charts/sector-weights" className="block mx-2">Sector Weights</Button>
            <Button to="/charts/dividends" className="block mx-2">Dividend History</Button>
            <Button to="/dividend-calendar" className="block mx-2">Dividend Calendar</Button>
            <Button to="/dividend-predictions" className="block mx-2">Dividend Predictions</Button>
            <Button to="/charts/income" className="block mx-2">Income Charts</Button>
          </div>
          
          {/* Tools & Settings */}
          <div className="border-b border-gray-600 pb-2">
            <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Tools & Settings
            </div>
            <Button to="/settings/excess-lots" className="block mx-2">Excess Lots</Button>
            <Button to="/settings/securities" className="block mx-2">Securities</Button>
            <Button to="/settings/scheduler" className="block mx-2">Scheduler</Button>
          </div>
          
          {/* Modelling */}
          <div>
            <div className="px-3 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Modelling
            </div>
            <Button to="/modelling/mpt" className="block mx-2">MPT Modelling</Button>
            <Button to="/modelling/results-explorer" className="block mx-2">Results Explorer</Button>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default ButtonizedNavbar;
