export type AccessRole = 'desk' | 'resident';
export type AccessSession = {
  role: AccessRole;
  name: string;
  email: string;
  residentIndex?: number;
  unit?: string;
  expiresAt: number;
  mode: 'demo' | 'api';
  capabilities?:{admin:boolean;manualRelease:boolean};
};

export function sessionForEnvironment(session:AccessSession|undefined,apiMode:boolean,configurationError=''){
  return !configurationError&&session?.mode===(apiMode?'api':'demo')?session:undefined;
}

// These public accounts are presentation fixtures, never production credentials.
export const PRESENTATION_ACCOUNTS = [
  { role: 'desk', name: 'Ricardo Silva', email: 'portaria@imperium.demo' },
  { role: 'resident', name: 'Ana Oliveira', email: 'ana@imperium.demo', residentIndex: 0 },
  { role: 'resident', name: 'Bruno Santos', email: 'bruno@imperium.demo', residentIndex: 1 },
  { role: 'resident', name: 'Clara Martins', email: 'clara@imperium.demo', residentIndex: 2 },
] as const;
export const PRESENTATION_PASSWORD = 'Imperium@2026';

export function authenticatePresentation(role: AccessRole, email: string, password: string, now = Date.now()): AccessSession {
  const account = PRESENTATION_ACCOUNTS.find(a => a.role === role && a.email === email.trim().toLowerCase());
  if (!account || password !== PRESENTATION_PASSWORD) throw new Error('Confira o e-mail e a senha deste acesso.');
  return { ...account, mode: 'demo', expiresAt: now + 8 * 60 * 60 * 1000 };
}

export function validPresentationSession(value: unknown, role: AccessRole, now = Date.now()): value is AccessSession {
  const session = value as AccessSession;
  return !!session && session.mode === 'demo' && session.role === role &&
    Number.isFinite(session.expiresAt) && session.expiresAt > now &&
    PRESENTATION_ACCOUNTS.some(a => a.role === role && a.email === session.email && a.name === session.name &&
      ('residentIndex' in a ? a.residentIndex === session.residentIndex : session.residentIndex === undefined));
}
