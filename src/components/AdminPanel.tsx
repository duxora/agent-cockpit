import { useState } from 'react'
import RailwayStatus from './RailwayStatus'
import MetricsCard from './MetricsCard'
import VariablesManager from './VariablesManager'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import { HooksManager } from './HooksManager'
import { SkillsManager } from './SkillsManager'
import { GitHubStatus } from './GitHubStatus'
import ClaudeTasksTab from './ClaudeTasksTab'
import { Settings } from 'lucide-react'

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'railway' | 'settings' | 'analytics' | 'skills' | 'hooks' | 'github' | 'claude-tasks'>('railway')

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-gray-800 px-6 py-3">
        <Settings className="h-5 w-5 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-100">Administration</h2>
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
          onClick={() => setActiveTab('skills')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'skills'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Skills
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
          onClick={() => setActiveTab('claude-tasks')}
          className={`flex-1 px-4 py-2 text-sm font-medium ${
            activeTab === 'claude-tasks'
              ? 'border-b-2 border-blue-500 text-blue-400'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Claude Tasks
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
        {activeTab === 'skills' && <SkillsManager />}
        {activeTab === 'hooks' && <HooksManager />}
        {activeTab === 'github' && <GitHubStatus />}
        {activeTab === 'claude-tasks' && <ClaudeTasksTab />}
        {activeTab === 'settings' && (
          <div className="text-gray-500 text-sm">Settings panel (existing content)</div>
        )}
      </div>
    </div>
  )
}
