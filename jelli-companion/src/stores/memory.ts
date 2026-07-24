import { create } from 'zustand'
import type { UserFact, LongTermMemory, MemoryState } from '@/lib/memory'
import {
  createSessionMemory,
  updateSessionMemory,
  saveLongTermMemory,
  loadLongTermMemory,
} from '@/lib/memory'

interface MemoryStore extends MemoryState {
  // Actions
  initialize: () => Promise<void>
  addFact: (fact: UserFact) => void
  addFacts: (facts: UserFact[]) => void
  removeFact: (key: string) => void
  processMessage: (text: string) => void
  resetSession: () => void
  persistLongTerm: () => Promise<void>
  updateProfile: (updates: Partial<LongTermMemory['userProfile']>) => void
  updatePreferences: (updates: Partial<LongTermMemory['preferences']>) => void
  addProject: (project: LongTermMemory['projects'][0]) => void
  removeProject: (name: string) => void
  clearLongTerm: () => Promise<void>
  getMemoryState: () => MemoryState
}

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  longTerm: {
    version: 1,
    userProfile: {},
    preferences: {},
    projects: [],
    facts: [],
  },
  session: createSessionMemory(),
  initialized: false,

  initialize: async () => {
    const longTerm = await loadLongTermMemory()
    // Don't reset session - keep it alive across chat close/open
    set({ longTerm, initialized: true })
  },

  addFact: (fact) => {
    const { longTerm } = get()
    const updated = { ...longTerm }

    // Handle profile facts
    if (fact.key === 'userName') {
      updated.userProfile = { ...updated.userProfile, name: fact.value }
    } else if (fact.key === 'userNickname') {
      updated.userProfile = { ...updated.userProfile, nickname: fact.value }
    } else if (fact.key === 'userAge') {
      updated.userProfile = { ...updated.userProfile, age: parseInt(fact.value) || undefined }
    } else if (fact.key === 'userJob') {
      updated.userProfile = { ...updated.userProfile, job: fact.value }
    } else if (fact.key === 'userLocation') {
      updated.userProfile = { ...updated.userProfile, location: fact.value }
    } else if (fact.key === 'userLanguages') {
      updated.userProfile = { ...updated.userProfile, languages: fact.value.split(',').map(l => l.trim()) }
    } else if (fact.key === 'userInterest') {
      const interests = new Set(updated.userProfile.interests ?? [])
      interests.add(fact.value)
      updated.userProfile = { ...updated.userProfile, interests: [...interests] }
    }
    // Handle preference facts
    else if (fact.key === 'prefCommunicationStyle') {
      updated.preferences = { ...updated.preferences, tone: fact.value }
    } else if (fact.key === 'prefTone') {
      updated.preferences = { ...updated.preferences, tone: fact.value }
    } else if (fact.key === 'prefResponseLength') {
      updated.preferences = { ...updated.preferences, responseLength: fact.value }
    } else if (fact.key === 'prefCodingStyle') {
      updated.preferences = { ...updated.preferences, codingStyle: fact.value }
    } else if (fact.key === 'prefUITheme') {
      updated.preferences = { ...updated.preferences, uiPreferences: [fact.value] }
    }
    // Handle project facts
    else if (fact.key === 'projectName') {
      const existing = updated.projects.findIndex(p => p.name === fact.value)
      if (existing >= 0) {
        updated.projects[existing] = { ...updated.projects[existing], updatedAt: Date.now() }
      } else {
        updated.projects.push({
          name: fact.value,
          description: '',
          updatedAt: Date.now(),
        })
      }
    }
    // Handle other facts
    else {
      const existing = updated.facts.findIndex(f => f.key === fact.key)
      if (existing >= 0) {
        if (fact.updatedAt > updated.facts[existing].updatedAt) {
          updated.facts[existing] = fact
        }
      } else {
        updated.facts.push(fact)
      }
    }

    set({ longTerm: updated })

    // Auto-persist if shouldPersist
    if (fact.shouldPersist) {
      get().persistLongTerm()
    }
  },

  addFacts: (facts) => {
    for (const fact of facts) {
      get().addFact(fact)
    }
  },

  removeFact: (key) => {
    const { longTerm } = get()
    const updated = { ...longTerm }

    // Check profile
    if (key === 'userName') {
      updated.userProfile = { ...updated.userProfile, name: undefined }
    } else if (key === 'userNickname') {
      updated.userProfile = { ...updated.userProfile, nickname: undefined }
    } else if (key === 'userAge') {
      updated.userProfile = { ...updated.userProfile, age: undefined }
    } else if (key === 'userJob') {
      updated.userProfile = { ...updated.userProfile, job: undefined }
    } else if (key === 'userLocation') {
      updated.userProfile = { ...updated.userProfile, location: undefined }
    }
    // Check facts
    else {
      updated.facts = updated.facts.filter(f => f.key !== key)
    }

    set({ longTerm: updated })
    get().persistLongTerm()
  },

  processMessage: (text) => {
    const { session } = get()
    const updatedSession = updateSessionMemory(session, text)

    // Auto-persist important facts from session to long-term
    for (const fact of updatedSession.recentImportantFacts) {
      if (fact.shouldPersist) {
        const { longTerm } = get()
        const existing = longTerm.facts.findIndex(f => f.key === fact.key)
        if (existing < 0 || fact.updatedAt > longTerm.facts[existing].updatedAt) get().addFact(fact)
      }
    }

    set({ session: updatedSession })
  },

  resetSession: () => {
    // Before resetting, persist any important session facts
    const { session, longTerm } = get()
    for (const fact of session.recentImportantFacts) {
      if (fact.shouldPersist) {
        const existing = longTerm.facts.findIndex(f => f.key === fact.key)
        if (existing < 0 || fact.updatedAt > longTerm.facts[existing].updatedAt) get().addFact(fact)
      }
    }

    set({ session: createSessionMemory() })
  },

  persistLongTerm: async () => {
    const { longTerm } = get()
    await saveLongTermMemory(longTerm)
  },

  updateProfile: (updates) => {
    const { longTerm } = get()
    set({
      longTerm: {
        ...longTerm,
        userProfile: { ...longTerm.userProfile, ...updates },
      },
    })
    get().persistLongTerm()
  },

  updatePreferences: (updates) => {
    const { longTerm } = get()
    set({
      longTerm: {
        ...longTerm,
        preferences: { ...longTerm.preferences, ...updates },
      },
    })
    get().persistLongTerm()
  },

  addProject: (project) => {
    const { longTerm } = get()
    const existing = longTerm.projects.findIndex(p => p.name === project.name)
    if (existing >= 0) {
      const updated = [...longTerm.projects]
      updated[existing] = { ...updated[existing], ...project, updatedAt: Date.now() }
      set({ longTerm: { ...longTerm, projects: updated } })
    } else {
      set({
        longTerm: {
          ...longTerm,
          projects: [...longTerm.projects, { ...project, updatedAt: Date.now() }],
        },
      })
    }
    get().persistLongTerm()
  },

  removeProject: (name) => {
    const { longTerm } = get()
    set({
      longTerm: {
        ...longTerm,
        projects: longTerm.projects.filter(p => p.name !== name),
      },
    })
    get().persistLongTerm()
  },

  clearLongTerm: async () => {
    const empty: LongTermMemory = {
      version: 1,
      userProfile: {},
      preferences: {},
      projects: [],
      facts: [],
    }
    set({ longTerm: empty })
    await saveLongTermMemory(empty)
  },

  getMemoryState: () => {
    const { longTerm, session, initialized } = get()
    return { longTerm, session, initialized }
  },
}))
