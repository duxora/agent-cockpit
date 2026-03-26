import { useState } from 'react'
import { LogOut } from 'lucide-react'
import RailwayStatus from './RailwayStatus'
import MetricsCard from './MetricsCard'
import VariablesManager from './VariablesManager'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import { HooksManager } from './HooksManager'

import { GitHubStatus } from './GitHubStatus'
import { Settings } from 'lucide-react'

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'hooks' | 'github'>('railway')

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Ignore errors, redirect anyway
    }
    window.location.href = '/login'
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-100">Administration</h2>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>

      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab('railway')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'railway'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Railway
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'analytics'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('hooks')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'hooks'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Hooks
        </button>
        <button
          onClick={() => setActiveTab('github')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'github'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          GitHub
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'settings'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Settings
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'railway' && (
          <div className="space-y-4">
            <MetricsCard />
            <RailwayStatus />
            <VariablesManager />
          </div>
        )}
        {activeTab === 'analytics' && <AnalyticsDashboard />}

        {activeTab === 'hooks' && <HooksManager />}
        {activeTab === 'github' && <GitHubStatus />}
{activeTab === 'settings' && (
          <div className="text-gray-500 text-sm">Settings panel (existing content)</div>
        )}
      </div>
    </div>
  )
}
