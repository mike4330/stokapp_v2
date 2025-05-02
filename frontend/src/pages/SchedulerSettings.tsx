import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SchedulerJob {
  id: string;
  name: string;
  next_run: string | null;
  enabled: boolean;
  persisted: boolean;
  persisted_state: boolean | null;
}

interface SchedulerStatus {
  status: string;
  jobs: SchedulerJob[];
}

const SchedulerSettings: React.FC = () => {
  const [schedulerData, setSchedulerData] = useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notification, setNotification] = useState<{type: 'success' | 'error', message: string} | null>(null);

  useEffect(() => {
    const fetchSchedulerStatus = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/scheduler/status');
        setSchedulerData(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching scheduler status:', err);
        setError('Failed to load scheduler data');
      } finally {
        setLoading(false);
      }
    };

    fetchSchedulerStatus();
  }, [refreshKey]);

  // Clear notification after 5 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleRefresh = () => {
    setRefreshKey(prevKey => prevKey + 1);
  };

  const handleToggleJob = async (jobId: string, enabled: boolean) => {
    try {
      setActionLoading(jobId);
      const endpoint = enabled ? 
        `/scheduler/job/${jobId}/pause` : 
        `/scheduler/job/${jobId}/resume`;
      
      const response = await axios.post(endpoint);
      
      if (response.data.success) {
        setNotification({
          type: 'success',
          message: response.data.message
        });
        // Refresh the job list
        setRefreshKey(prevKey => prevKey + 1);
      } else {
        setNotification({
          type: 'error',
          message: response.data.message || 'Failed to update job status'
        });
      }
    } catch (err) {
      console.error(`Error toggling job ${jobId}:`, err);
      setNotification({
        type: 'error',
        message: 'Failed to update job status'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunNow = async (jobId: string) => {
    try {
      setActionLoading(`run-${jobId}`);
      const endpoint = `/scheduler/job/${jobId}/run-now`;
      
      const response = await axios.post(endpoint);
      
      if (response.data.success) {
        setNotification({
          type: 'success',
          message: `Job ${jobId} executed successfully`
        });
        // Refresh the job list
        setRefreshKey(prevKey => prevKey + 1);
      } else {
        setNotification({
          type: 'error',
          message: response.data.message || 'Failed to execute job'
        });
      }
    } catch (err) {
      console.error(`Error executing job ${jobId}:`, err);
      setNotification({
        type: 'error',
        message: 'Failed to execute job'
      });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'running' ? 'text-green-500' : 'text-red-500';
  };

  const formatNextRun = (nextRun: string | null) => {
    if (!nextRun) return 'Disabled';
    
    // Parse the date string
    const date = new Date(nextRun);
    
    // Format date for display
    return date.toLocaleString();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Scheduler Settings
        </h1>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md shadow-sm transition-colors duration-200 flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
          Refresh
        </button>
      </div>
      
      {/* Notification */}
      {notification && (
        <div className={`p-4 mb-4 rounded-md ${
          notification.type === 'success' 
            ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-400' 
            : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-400'
        }`}>
          {notification.message}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 dark:bg-red-900/20 border-l-4 border-red-500 p-4 mb-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <div className="mr-4">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  schedulerData?.status === 'running' 
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' 
                  : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                }`}>
                  {schedulerData?.status === 'running' ? 'Running' : 'Stopped'}
                </span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Scheduler Status
              </h2>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Job ID
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Next Run
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Persisted
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {schedulerData?.jobs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                      No scheduled jobs found
                    </td>
                  </tr>
                ) : (
                  schedulerData?.jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        {job.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {job.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                        {formatNextRun(job.next_run)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          job.enabled
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                        }`}>
                          {job.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          job.persisted 
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
                            : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                        }`}>
                          {job.persisted ? (job.persisted_state ? 'Enabled' : 'Disabled') : 'Not saved'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => handleToggleJob(job.id, job.enabled)}
                            disabled={actionLoading === job.id}
                            className={`inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                              job.enabled
                                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500'
                                : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                            } ${actionLoading === job.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {actionLoading === job.id ? (
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : job.enabled ? 'Disable' : 'Enable'}
                          </button>
                          
                          <button
                            onClick={() => handleRunNow(job.id)}
                            disabled={actionLoading === `run-${job.id}` || !job.enabled}
                            className={`inline-flex items-center px-3 py-1 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                              (actionLoading === `run-${job.id}` || !job.enabled) ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                          >
                            {actionLoading === `run-${job.id}` ? (
                              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                            ) : 'Run Now'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Scheduler Information
        </h2>
        <div className="prose dark:prose-invert">
          <p>
            The scheduler runs background tasks at specific intervals. Currently configured jobs:
          </p>
          <ul>
            <li><strong>update_overamt</strong> - Updates allocation calculations every 5 minutes during market hours (9:00 AM - 4:00 PM ET, weekdays only)</li>
            <li><strong>price_updater</strong> - Updates stock prices starting at 9:35 AM ET on weekdays, running continuously in a loop until market close (4:00 PM ET)</li>
          </ul>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-4">
            Jobs can be enabled or disabled using the buttons in the table above. Disabled jobs will not run until they are re-enabled.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            <strong>Persistence:</strong> Job states (enabled/disabled) are now persisted and will be restored after application restart. 
            The "Persisted" column shows the saved state of each job that will be applied on restart.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SchedulerSettings; 
