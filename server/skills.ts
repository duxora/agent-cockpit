import fs from 'fs'
import path from 'path'

export interface Skill {
  name: string
  description: string
  version: string
  category: string
  enabled: boolean
  path: string
}

export async function listAvailableSkills(): Promise<Skill[]> {
  const skillsDir = path.join(process.env.HOME || '', '.claude', 'skills')

  // Handle if directory doesn't exist
  if (!fs.existsSync(skillsDir)) {
    return []
  }

  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    const skills: Skill[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = path.join(skillsDir, entry.name)
      const metadata = parseSkillMetadata(skillPath, entry.name)

      if (metadata) {
        skills.push(metadata)
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name))
  } catch (error) {
    console.error('Failed to list skills:', error)
    return []
  }
}

function parseSkillMetadata(skillPath: string, skillName: string): Skill | null {
  try {
    // Try to read skill.md for metadata in frontmatter
    const skillMdPath = path.join(skillPath, 'skill.md')
    if (fs.existsSync(skillMdPath)) {
      const content = fs.readFileSync(skillMdPath, 'utf-8')
      const metadata = extractFrontmatter(content)

      return {
        name: metadata.name || skillName,
        description: metadata.description || '',
        version: metadata.version || '1.0.0',
        category: metadata.category || 'uncategorized',
        enabled: true, // In MVP, assume all discovered skills are enabled
        path: skillPath
      }
    }

    // Fallback: use directory name as skill name
    return {
      name: skillName,
      description: 'No metadata available',
      version: '1.0.0',
      category: 'uncategorized',
      enabled: true,
      path: skillPath
    }
  } catch (error) {
    console.error(`Failed to parse skill ${skillName}:`, error)
    return null
  }
}

function extractFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const frontmatter: Record<string, string> = {}
  const lines = match[1].split('\n')

  for (const line of lines) {
    const [key, ...valueParts] = line.split(':')
    if (key && valueParts.length > 0) {
      frontmatter[key.trim()] = valueParts.join(':').trim()
    }
  }

  return frontmatter
}

export function getSkillMetadata(skillName: string): Skill | null {
  const skillsDir = path.join(process.env.HOME || '', '.claude', 'skills')
  const skillPath = path.join(skillsDir, skillName)

  if (!fs.existsSync(skillPath)) {
    return null
  }

  return parseSkillMetadata(skillPath, skillName)
}
