import { execSync } from 'child_process'

export interface TmuxSession {
  name: string
  created: number
  width: number
  height: number
  attached: boolean
  activity: number
}

export interface SessionInfo {
  name: string
  created: number
  attached: boolean
  lastActivity: number
  idleSecs: number
  status: 'active' | 'idle' | 'waiting' | 'dead'
  cwd: string
}

function runTmux(args: string): string {
  try {
    return execSync(`tmux ${args}`, { encoding: 'utf-8', timeout: 5000 }).trim()
  } catch {
    return ''
  }
}

export function listSessions(): SessionInfo[] {
  const raw = runTmux(
    'list-sessions -F "#{session_name}\t#{session_created}\t#{session_attached}\t#{session_activity}\t#{pane_current_path}"'
  )
  if (!raw) return []

  const now = Math.floor(Date.now() / 1000)

  return raw.split('\n').filter(Boolean).map((line) => {
    const [name, created, attached, activity, cwd] = line.split('\t')
    const lastActivity = parseInt(activity) || now
    const idleSecs = now - lastActivity

    let status: SessionInfo['status'] = 'active'
    if (idleSecs > 300) {
      status = 'idle'
    } else if (idleSecs > 30) {
      status = 'waiting'
    }

    return {
      name,
      created: parseInt(created) || now,
      attached: attached === '1',
      lastActivity,
      idleSecs,
      status,
      cwd: cwd || '~',
    }
  })
}

export function getSessionContent(name: string, lines = 200): string {
  return runTmux(`capture-pane -t "${name}" -p -S -${lines}`)
}

export function createSession(name: string, command: string, cwd?: string): boolean {
  try {
    const cwdArg = cwd ? `-c "${cwd}"` : ''
    execSync(`tmux new-session -d -s "${name}" ${cwdArg} "${command}"`, {
      encoding: 'utf-8',
      timeout: 10000,
    })
    return true
  } catch {
    return false
  }
}

export function killSession(name: string): boolean {
  try {
    execSync(`tmux kill-session -t "${name}"`, { encoding: 'utf-8', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

export function sendKeys(name: string, keys: string): boolean {
  try {
    execSync(`tmux send-keys -t "${name}" "${keys}"`, { encoding: 'utf-8', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

export function sessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t "${name}"`, { timeout: 5000 })
    return true
  } catch {
    return false
  }
}

// Detect if session output contains permission prompts or idle patterns
export function detectSessionState(content: string): 'active' | 'idle' | 'waiting' {
  const lines = content.split('\n').slice(-20) // Last 20 lines
  const recent = lines.join('\n')

  // Claude Code permission patterns
  const permissionPatterns = [
    /Allow.*\?.*\(y\/n\)/i,
    /Do you want to allow/i,
    /Press Enter to continue/i,
    /\[y\/N\]/,
    /\[Y\/n\]/,
    /Approve\?/i,
  ]

  for (const pattern of permissionPatterns) {
    if (pattern.test(recent)) return 'waiting'
  }

  return 'active'
}
