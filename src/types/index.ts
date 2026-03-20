export interface Session {
  name: string
  created: number
  attached: boolean
  lastActivity: number
  idleSecs: number
  status: 'active' | 'idle' | 'waiting' | 'dead'
  cwd: string
}

export interface SessionEvent {
  id: number
  sessionName: string
  eventType: string
  data: string | null
  createdAt: number
}
