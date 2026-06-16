export const springs = {
  window: { type: 'spring' as const, stiffness: 350, damping: 22, mass: 1.2 },
  messageEnter: { type: 'spring' as const, duration: 0.4, bounce: 0.15 },
  messageExit: { type: 'spring' as const, stiffness: 250, damping: 20, mass: 0.6 },
  thinkingGlow: { type: 'spring' as const, stiffness: 100, damping: 5, mass: 0.3 },
  particleIdle: { type: 'spring' as const, stiffness: 50, damping: 10, mass: 2 },
  press: { type: 'spring' as const, stiffness: 400, damping: 15, mass: 1 },
} as const;
