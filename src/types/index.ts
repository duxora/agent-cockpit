export interface Session {
  name: string
  id: string
  created: number
  attached: boolean
  lastActivity: number
  idleSecs: number
  status: 'active' | 'idle' | 'waiting' | 'dead' | 'stopped'
  cwd: string
  source: 'tmux' | 'local'
  sessionId?: string
  relayConnected?: boolean
  display_mode: 'terminal' | 'text'
  outputs?: string[]
}

export interface SessionGroup {
  project: string
  sessions: Session[]
  waitingCount: number
  activeCount: number
}

export interface SessionEvent {
  id: number
  sessionName: string
  eventType: string
  data: string | null
  createdAt: number
}
