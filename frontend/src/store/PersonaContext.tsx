import React, { createContext, useContext, useMemo, useState } from 'react';

export interface PersonaOption {
  id: string;
  label: string;
}

export const PERSONAS: PersonaOption[] = [
  { id: 'persona-budget-rahul', label: 'Rahul · Budget' },
  { id: 'persona-health-priya', label: 'Priya · Health' },
];

interface PersonaContextValue {
  persona: string;
  setPersona: (id: string) => void;
  personas: PersonaOption[];
}

const PersonaContext = createContext<PersonaContextValue | undefined>(undefined);

export function PersonaProvider({ children }: { children: React.ReactNode }) {
  const [persona, setPersona] = useState<string>(PERSONAS[0].id);
  const value = useMemo(() => ({ persona, setPersona, personas: PERSONAS }), [persona]);
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within a PersonaProvider');
  return ctx;
}
