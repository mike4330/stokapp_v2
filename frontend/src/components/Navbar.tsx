/*
 * Copyright (C) 2025 Mike Roetto <mike@roetto.org>
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * With assistance from Claude (Anthropic)
 */

/**
 * Navbar Component
 * 
 * Main navigation bar for the application. Provides links to major sections,
 * dropdown menus for charts and settings, and a dark mode toggle. Includes
 * responsive design for mobile views.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const Navbar: React.FC = () => {
  const [isChartsOpen, setIsChartsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModellingOpen, setIsModellingOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    // Check if user has a dark mode preference
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' || 
             (window.matchMedia('(prefers-color-scheme: dark)').matches && 
              localStorage.getItem('darkMode') === null);
    }
    return false;
  });

  useEffect(() => {
    // Update dark mode class on document
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Save preference
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isChartsOpen || isSettingsOpen || isModellingOpen) {
        const target = event.target as HTMLElement;
        if (!target.closest('.dropdown-container')) {
          setIsChartsOpen(false);
          setIsSettingsOpen(false);
          setIsModellingOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChartsOpen, isSettingsOpen, isModellingOpen]);

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex">
            {/* Logo/Brand */}
            <div className="flex-shrink-0 flex items-center">
              <Link to="/" className="text-xl font-bold text-primary-600 dark:text-primary-400">MPMV2</Link>
            </div>

            {/* Navigation Items */}
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                to="/transactions"
                className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
              >
                Transactions
              </Link>
              <Link
                to="/holdings"
                className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
              >
                Holdings
              </Link>
              <Link
                to="/potential-lots"
                className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
              >
                Potential Lots
              </Link>
              <Link
                to="/lot-manager"
                className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
              >
                Lot Manager
              </Link>
              
              {/* Charts Dropdown */}
              <div className="relative inline-flex items-center h-full dropdown-container">
                <button
                  onClick={() => {
                    setIsChartsOpen(!isChartsOpen);
                    setIsSettingsOpen(false); // Close settings when opening charts
                  }}
                  className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
                >
                  Charts
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
                </button>

                {/* Charts Dropdown Menu */}
                {isChartsOpen && (
                  <div className="absolute left-0 top-full mt-1 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <Link
                        to="/charts/portfolio"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsChartsOpen(false)}
                      >
                        Portfolio Performance
                      </Link>
                      <Link
                        to="/charts/sector"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsChartsOpen(false)}
                      >
                        Sector Allocation
                      </Link>
                      <Link
                        to="/charts/sunburst"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsChartsOpen(false)}
                      >
                        Portfolio Sunburst
                      </Link>
                      <Link
                        to="/charts/dividends"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsChartsOpen(false)}
                      >
                        Dividend History
                      </Link>
                      <Link
                        to="/charts/allocation"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsChartsOpen(false)}
                      >
                        Allocation Grid
                      </Link>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Settings Dropdown */}
              <div className="relative inline-flex items-center h-full dropdown-container">
                <button
                  onClick={() => {
                    setIsSettingsOpen(!isSettingsOpen);
                    setIsChartsOpen(false); // Close charts when opening settings
                  }}
                  className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
                >
                  Settings
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
                </button>

                {/* Settings Dropdown Menu */}
                {isSettingsOpen && (
                  <div className="absolute left-0 top-full mt-1 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <Link
                        to="/settings/scheduler"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsSettingsOpen(false)}
                      >
                        Scheduler
                      </Link>
                      {/* Add more settings options here */}
                    </div>
                  </div>
                )}
              </div>

              {/* Modelling Dropdown */}
              <div className="relative inline-flex items-center h-full dropdown-container">
                <button
                  onClick={() => {
                    setIsModellingOpen(!isModellingOpen);
                    setIsChartsOpen(false);
                    setIsSettingsOpen(false);
                  }}
                  className="border-transparent text-gray-500 dark:text-gray-300 hover:border-primary-500 hover:text-gray-700 dark:hover:text-gray-100 inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium h-full"
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
                </button>

                {/* Modelling Dropdown Menu */}
                {isModellingOpen && (
                  <div className="absolute left-0 top-full mt-1 w-48 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1" role="menu" aria-orientation="vertical">
                      <Link
                        to="/modelling/mpt"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsModellingOpen(false)}
                      >
                        MPT Modelling
                      </Link>
                      <Link
                        to="/modelling/results-explorer"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsModellingOpen(false)}
                      >
                        Results Explorer
                      </Link>
                      <Link
                        to="/modelling/recommendations"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        role="menuitem"
                        onClick={() => setIsModellingOpen(false)}
                      >
                        Buy Recommendations
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dark Mode Toggle */}
          <div className="flex items-center">
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-md text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
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
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className="sm:hidden">
        <div className="pt-2 pb-3 space-y-1">
          <Link
            to="/transactions"
            className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Transactions
          </Link>
          <Link
            to="/holdings"
            className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Holdings
          </Link>
          <Link
            to="/modelling/mpt"
            className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 hover:text-gray-800 dark:hover:text-gray-100"
          >
            MPT Modelling
          </Link>
          <Link
            to="/modelling/results-explorer"
            className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Results Explorer
          </Link>
          <Link
            to="/settings/scheduler"
            className="block pl-3 pr-4 py-2 border-l-4 border-transparent text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-primary-500 hover:text-gray-800 dark:hover:text-gray-100"
          >
            Scheduler Settings
          </Link>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 