// ── Memory types and persistence ─────────────────────────────────────────────
// Comprehensive, typed memory schema for reliable cross-session memory.
// Three tiers: long-term (cross-session), session (within session), and
// rolling summary (compressed session history).

export interface UserFact {
  key: string
  value: string
  source: 'explicit' | 'session-summary'
  confidence: number // 0-1, higher = more certain
  shouldPersist: boolean // true = save to long-term
  updatedAt: number // timestamp
}

export interface Project {
  name: string
  description: string
  status?: string
  updatedAt: number
}

export interface SessionMemory {
  sessionId: string
  startedAt: number
  lastUpdatedAt: number
  rollingSummary: string
  recentImportantFacts: UserFact[]
  openTasks: string[]
  messagesProcessed: number
}

export interface MemoryState {
  longTerm: LongTermMemory
  session: SessionMemory
  initialized: boolean
}

export interface LongTermMemory {
  version: number
  userProfile: {
    name?: string
    nickname?: string
    age?: number
    job?: string
    location?: string
    interests?: string[]
    sex?: string
    languages?: string[]
    communicationStyle?: string[]
  }
  preferences: {
    tone?: string
    responseLength?: string
    codingStyle?: string
    uiPreferences?: string[]
  }
  projects: Project[]
  facts: UserFact[]
}

// ── Fact extraction rules ───────────────────────────────────────────────────
// Rule-based extraction patterns with broader matching and proper categorization.

interface ExtractionRule {
  pattern: RegExp
  key: string
  category: 'profile' | 'preference' | 'project' | 'task' | 'other'
  extractor: (match: RegExpMatchArray) => string | null
  shouldPersist: boolean
}

const EXTRACTION_RULES: ExtractionRule[] = [
  // ── Profile facts ──────────────────────────────────────────────────────
  // Name patterns
  {
    pattern: /(?:my name is|i'm|i am|call me) ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i,
    key: 'userName',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Nickname patterns
  {
    pattern: /(?:you can call me|my nickname is|nickname me) ([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/i,
    key: 'userNickname',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Age patterns
  {
    pattern: /(?:i'm|i am) (\d{1,3}) (?:years? old|yo)/i,
    key: 'userAge',
    category: 'profile',
    extractor: (m) => m[1],
    shouldPersist: true,
  },
  // Job/role
  {
    pattern: /(?:i work as|i'm a|i am a|my job is|my role is|i'm working as) ([a-z]+(?:\s[a-z]+){0,3})/i,
    key: 'userJob',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Location
  {
    pattern: /(?:i live in|i'm from|i'm in|based in|located in) ([a-z]+(?:\s[a-z]+){0,2})/i,
    key: 'userLocation',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Languages
  {
    pattern: /(?:i speak|my language is|languages? i know) ([a-z]+(?:\s*,?\s*[a-z]+)*)/i,
    key: 'userLanguages',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },

  // ── Preference facts ───────────────────────────────────────────────────
  // Communication style preferences
  {
    pattern: /(?:don't|do not|stop) (?:be |being )?(?:formal|polite|professional)/i,
    key: 'prefCommunicationStyle',
    category: 'preference',
    extractor: () => 'casual, informal',
    shouldPersist: true,
  },
  {
    pattern: /(?:be |stay |keep it )(?:more |extra )?(?:casual|informal|relaxed|chill)/i,
    key: 'prefCommunicationStyle',
    category: 'preference',
    extractor: () => 'casual, relaxed',
    shouldPersist: true,
  },
  {
    pattern: /(?:don't|do not|stop) (?:use |using )?(?:emojis?|emoticons?)/i,
    key: 'prefNoEmojis',
    category: 'preference',
    extractor: () => 'no emojis',
    shouldPersist: true,
  },
  {
    pattern: /(?:use |prefer |i like )(?:simple |plain |easy )?(?:words?|language)/i,
    key: 'prefLanguage',
    category: 'preference',
    extractor: () => 'simple language',
    shouldPersist: true,
  },
  {
    pattern: /(?:be |stay |keep it )(?:more |extra )?(?:direct|straightforward|blunt)/i,
    key: 'prefTone',
    category: 'preference',
    extractor: () => 'direct',
    shouldPersist: true,
  },
  {
    pattern: /(?:be |stay |keep it )(?:more |extra )?(?:verbose|detailed|thorough)/i,
    key: 'prefTone',
    category: 'preference',
    extractor: () => 'verbose',
    shouldPersist: true,
  },
  {
    pattern: /(?:from now on|going forward|always) (?:respond|reply|answer) (?:with |in )?(?:short |brief |long |detailed )?(?:responses?|replies?|answers?)/i,
    key: 'prefResponseLength',
    category: 'preference',
    extractor: (m) => m[0].includes('short') || m[0].includes('brief') ? 'short' : 'detailed',
    shouldPersist: true,
  },
  // Coding style
  {
    pattern: /(?:i (?:prefer|like|use) |use )?(?:typescript|javascript|python|rust|go) (?:for|in|when)/i,
    key: 'prefCodingStyle',
    category: 'preference',
    extractor: (m) => {
      const lang = m[0].match(/(typescript|javascript|python|rust|go)/i)
      return lang ? lang[1].toLowerCase() : 'general'
    },
    shouldPersist: true,
  },
  // UI preferences
  {
    pattern: /(?:i (?:prefer|like|want) )(?:dark|light|auto) (?:mode|theme)/i,
    key: 'prefUITheme',
    category: 'preference',
    extractor: (m) => {
      const theme = m[0].match(/(dark|light|auto)/i)
      return theme ? theme[1].toLowerCase() : 'auto'
    },
    shouldPersist: true,
  },

  // ── Project facts ──────────────────────────────────────────────────────
  // Project names
  {
    pattern: /(?:this|my|the|our) (?:project|app|application|tool|website|system) (?:is |called |named )?([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)*)/i,
    key: 'projectName',
    category: 'project',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Project status
  {
    pattern: /(?:we(?:'re| are) |i'm |i am )(?:working on|building|fixing|adding|implementing|developing) ([a-z]+(?:\s[a-z]+){0,5})/i,
    key: 'projectTask',
    category: 'project',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Project goals
  {
    pattern: /(?:the goal is|we need to|we want to|i want to|i need to) ([a-z]+(?:\s[a-z]+){0,7})/i,
    key: 'projectGoal',
    category: 'project',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },

  // ── Task facts ─────────────────────────────────────────────────────────
  // Open tasks
  {
    pattern: /(?:let's|we should|we need to|i need to|i should|todo|to do) ([a-z]+(?:\s[a-z]+){0,5})/i,
    key: 'openTask',
    category: 'task',
    extractor: (m) => m[1].trim(),
    shouldPersist: false, // tasks are session-specific
  },
  // Important errors/issues
  {
    pattern: /(?:there's a |there is a |found a |bug: |issue: |error: )([a-z]+(?:\s[a-z]+){0,5})/i,
    key: 'knownIssue',
    category: 'task',
    extractor: (m) => m[1].trim(),
    shouldPersist: true, // issues might be important to remember
  },

  // ── Interests ──────────────────────────────────────────────────────────
  {
    pattern: /(?:i (?:like|love|enjoy|prefer|am interested in)) ([a-z]+(?:\s[a-z]+){0,3})/i,
    key: 'userInterest',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Pet name
  {
    pattern: /(?:my (?:cat|dog|pet|hamster|fish|bird) (?:is|named?|called?)) ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
    key: 'petName',
    category: 'profile',
    extractor: (m) => m[1].trim(),
    shouldPersist: true,
  },
  // Favorite
  {
    pattern: /(?:my favorite|favourite) ([a-z]+) is ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
    key: 'favorite',
    category: 'profile',
    extractor: (m) => `${m[1]}: ${m[2].trim()}`,
    shouldPersist: true,
  },
]

// ── Extraction logic ────────────────────────────────────────────────────────
export function extractFacts(text: string): UserFact[] {
  const now = Date.now()
  const facts: UserFact[] = []

  for (const rule of EXTRACTION_RULES) {
    const match = text.match(rule.pattern)
    if (match) {
      const value = rule.extractor(match)
      if (value && value.length > 0) {
        facts.push({
          key: rule.key,
          value,
          source: 'explicit',
          confidence: 0.9,
          shouldPersist: rule.shouldPersist,
          updatedAt: now,
        })
      }
    }
  }

  return facts
}

// ── Session memory management ───────────────────────────────────────────────
export function createSessionMemory(): SessionMemory {
  return {
    sessionId: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    startedAt: Date.now(),
    lastUpdatedAt: Date.now(),
    rollingSummary: '',
    recentImportantFacts: [],
    openTasks: [],
    messagesProcessed: 0,
  }
}

export function updateSessionMemory(
  session: SessionMemory,
  messageText: string
): SessionMemory {
  const newFacts = extractFacts(messageText)
  const now = Date.now()

  // Update rolling summary (keep recent context)
  const summaryLines = session.rollingSummary.split('\n').filter(Boolean)
  summaryLines.push(`User: ${messageText.slice(0, 100)}${messageText.length > 100 ? '...' : ''}`)
  // Keep last 10 summary lines
  const trimmedSummary = summaryLines.slice(-10).join('\n')

  // Merge new facts with existing
  const merged = [...session.recentImportantFacts]
  for (const fact of newFacts) {
    const existing = merged.findIndex((f) => f.key === fact.key)
    if (existing >= 0) {
      // Update if higher confidence or more recent
      if (
        fact.confidence >= merged[existing].confidence ||
        fact.updatedAt > merged[existing].updatedAt
      ) {
        merged[existing] = fact
      }
    } else {
      merged.push(fact)
    }
  }

  // Extract open tasks
  const taskMatch = messageText.match(/(?:let's|we should|we need to|i need to|i should) ([a-z]+(?:\s[a-z]+){0,5})/i)
  const openTasks = [...session.openTasks]
  if (taskMatch && !openTasks.includes(taskMatch[1].trim())) {
    openTasks.push(taskMatch[1].trim())
  }

  return {
    ...session,
    lastUpdatedAt: now,
    rollingSummary: trimmedSummary,
    recentImportantFacts: merged,
    openTasks: openTasks.slice(-5), // keep last 5 tasks
    messagesProcessed: session.messagesProcessed + 1,
  }
}

// ── Prompt formatting ───────────────────────────────────────────────────────
// Format memory into a compact, readable context block for the LLM.
// This is injected into the system prompt to give Jelli memory.
export function formatMemoryContext(memory: MemoryState): string {
  const sections: string[] = []

  // Long-term user profile
  const profile = memory.longTerm.userProfile
  const profileLines: string[] = []
  if (profile.name) profileLines.push(`- Name: ${profile.name}`)
  if (profile.nickname) profileLines.push(`- Nickname: ${profile.nickname}`)
  if (profile.age) profileLines.push(`- Age: ${profile.age}`)
  if (profile.job) profileLines.push(`- Job: ${profile.job}`)
  if (profile.location) profileLines.push(`- Location: ${profile.location}`)
  if (profile.interests?.length) profileLines.push(`- Interests: ${profile.interests.join(', ')}`)
  if (profile.sex) profileLines.push(`- Gender: ${profile.sex}`)
  if (profile.languages?.length) profileLines.push(`- Languages: ${profile.languages.join(', ')}`)
  if (profile.communicationStyle?.length) profileLines.push(`- Communication style: ${profile.communicationStyle.join(', ')}`)

  if (profileLines.length > 0) {
    sections.push(`User profile:\n${profileLines.join('\n')}`)
  }

  // Preferences
  const prefs = memory.longTerm.preferences
  const prefLines: string[] = []
  if (prefs.tone) prefLines.push(`- Tone: ${prefs.tone}`)
  if (prefs.responseLength) prefLines.push(`- Response length: ${prefs.responseLength}`)
  if (prefs.codingStyle) prefLines.push(`- Coding style: ${prefs.codingStyle}`)
  if (prefs.uiPreferences?.length) prefLines.push(`- UI preferences: ${prefs.uiPreferences.join(', ')}`)

  if (prefLines.length > 0) {
    sections.push(`Preferences:\n${prefLines.join('\n')}`)
  }

  // Projects
  if (memory.longTerm.projects.length > 0) {
    const projectLines = memory.longTerm.projects.map(p => {
      const status = p.status ? ` (${p.status})` : ''
      return `- ${p.name}: ${p.description}${status}`
    })
    sections.push(`Projects:\n${projectLines.join('\n')}`)
  }

  // Additional facts
  const otherFacts = memory.longTerm.facts.filter(f =>
    !f.key.startsWith('userName') &&
    !f.key.startsWith('userNickname') &&
    !f.key.startsWith('pref') &&
    !f.key.startsWith('project')
  )
  if (otherFacts.length > 0) {
    const factLines = otherFacts.map(f => `- ${formatFactKey(f.key)}: ${f.value}`)
    sections.push(`Other facts:\n${factLines.join('\n')}`)
  }

  // Session context
  const sessionLines: string[] = []
  if (memory.session.rollingSummary) {
    sessionLines.push(`Recent conversation summary:\n${memory.session.rollingSummary}`)
  }
  if (memory.session.openTasks.length > 0) {
    sessionLines.push(`Open tasks:\n${memory.session.openTasks.map(t => `- ${t}`).join('\n')}`)
  }
  if (memory.session.recentImportantFacts.length > 0) {
    const sessionFactLines = memory.session.recentImportantFacts
      .filter(f => !memory.longTerm.facts.some(lf => lf.key === f.key))
      .map(f => `- ${formatFactKey(f.key)}: ${f.value}`)
    if (sessionFactLines.length > 0) {
      sessionLines.push(`Session facts:\n${sessionFactLines.join('\n')}`)
    }
  }

  if (sessionLines.length > 0) {
    sections.push(`Current session:\n${sessionLines.join('\n')}`)
  }

  if (sections.length === 0) return ''

  return `Known user context:\n${sections.join('\n\n')}`
}

function formatFactKey(key: string): string {
  const map: Record<string, string> = {
    userName: 'Name',
    userNickname: 'Nickname',
    userAge: 'Age',
    userJob: 'Job',
    userLocation: 'Location',
    userLanguages: 'Languages',
    userInterest: 'Interest',
    petName: 'Pet',
    favorite: 'Favorite',
    prefCommunicationStyle: 'Communication style',
    prefNoEmojis: 'Emoji preference',
    prefLanguage: 'Language preference',
    prefTone: 'Tone preference',
    prefResponseLength: 'Response length',
    prefCodingStyle: 'Coding preference',
    prefUITheme: 'UI theme',
    projectName: 'Project',
    projectTask: 'Project task',
    projectGoal: 'Project goal',
    openTask: 'Open task',
    knownIssue: 'Known issue',
  }
  return map[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
}

// ── Persistence (IPC wrappers) ──────────────────────────────────────────────
// These call Tauri commands for disk persistence.
import { invoke } from '@tauri-apps/api/core'

export async function saveLongTermMemory(memory: LongTermMemory): Promise<void> {
  await invoke('save_memory', { memory })
}

export async function loadLongTermMemory(): Promise<LongTermMemory> {
  try {
    const result = await invoke<LongTermMemory>('load_memory')
    return result ?? getDefaultLongTermMemory()
  } catch {
    return getDefaultLongTermMemory()
  }
}

function getDefaultLongTermMemory(): LongTermMemory {
  return {
    version: 1,
    userProfile: {},
    preferences: {},
    projects: [],
    facts: [],
  }
}

// ── Memory command handlers ─────────────────────────────────────────────────
export function handleMemoryCommand(
  command: string,
  args: string,
  memory: MemoryState
): { response: string; action?: 'clear' | 'show' | 'add' | 'remove' } {
  switch (command) {
    case '/memory': {
      const context = formatMemoryContext(memory)
      if (!context) {
        return { response: 'no memory saved yet tbh 🪼', action: 'show' }
      }
      return { response: context, action: 'show' }
    }

    case '/forget': {
      if (!args) {
        return { response: 'usage: /forget <thing> — tell me what to forget 🪼' }
      }
      // Try to find and remove the fact
      const searchTerm = args.toLowerCase()
      const factIndex = memory.longTerm.facts.findIndex(f =>
        f.key.toLowerCase().includes(searchTerm) ||
        f.value.toLowerCase().includes(searchTerm)
      )
      if (factIndex >= 0) {
        const removed = memory.longTerm.facts[factIndex]
        return {
          response: `ok forgot about ${formatFactKey(removed.key)}: ${removed.value} 🪼`,
          action: 'remove'
        }
      }
      // Check profile
      const profile = memory.longTerm.userProfile
      if (profile.name?.toLowerCase().includes(searchTerm)) {
        return { response: `ok forgot your name 🪼`, action: 'remove' }
      }
      if (profile.nickname?.toLowerCase().includes(searchTerm)) {
        return { response: `ok forgot your nickname 🪼`, action: 'remove' }
      }
      return { response: `didn't find anything about "${args}" to forget 🪼` }
    }

    case '/remember': {
      if (!args) {
        return { response: 'usage: /remember <fact> — tell me something to remember 🪼' }
      }
      return { response: `ok i'll remember: ${args} 🪼`, action: 'add' }
    }

    case '/new':
    case '/reset': {
      return { response: 'starting fresh! what\'s up? 🪼', action: 'clear' }
    }

    default:
      return { response: 'unknown command 🪼' }
  }
}
