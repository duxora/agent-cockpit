import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface Skill {
  name: string
  description: string
  version: string
  category: string
  enabled: boolean
  path: string
}

export function SkillsManager() {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')

  useEffect(() => {
    fetchSkills()
  }, [])

  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/skills')
      const data = await res.json()
      setSkills(data)
    } catch (error) {
      console.error('Failed to fetch skills:', error)
    } finally {
      setLoading(false)
    }
  }

  const categories = ['all', ...new Set(skills.map(s => s.category))]

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(search.toLowerCase()) ||
                         skill.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory

    return matchesSearch && matchesCategory
  })

  if (loading) return <div className="p-4 text-gray-400">Loading skills...</div>

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold text-gray-100">Claude Code Skills</h2>

      <div className="flex gap-4">
        <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-700 rounded px-3">
          <Search size={18} className="text-gray-500" />
          <input
            type="text"
            placeholder="Search skills..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 py-2 outline-none bg-gray-900 text-gray-100 placeholder-gray-500"
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-4 py-2 border border-gray-700 rounded bg-gray-900 text-gray-100"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700 bg-gray-800">
              <th className="text-left px-4 py-3 text-gray-300">Name</th>
              <th className="text-left px-4 py-3 text-gray-300">Description</th>
              <th className="text-left px-4 py-3 text-gray-300">Category</th>
              <th className="text-left px-4 py-3 text-gray-300">Version</th>
              <th className="text-left px-4 py-3 text-gray-300">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredSkills.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-4 text-gray-500">
                  No skills found
                </td>
              </tr>
            ) : (
              filteredSkills.map(skill => (
                <tr key={skill.name} className="border-b border-gray-700 hover:bg-gray-800">
                  <td className="px-4 py-3 font-semibold text-gray-100">{skill.name}</td>
                  <td className="px-4 py-3 text-gray-400">{skill.description}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-blue-900 text-blue-200 px-2 py-1 rounded">
                      {skill.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{skill.version}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${
                      skill.enabled
                        ? 'bg-green-900 text-green-200'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {skill.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {skills.length > 0 && (
        <div className="text-sm text-gray-500">
          Showing {filteredSkills.length} of {skills.length} skills
        </div>
      )}
    </div>
  )
}
