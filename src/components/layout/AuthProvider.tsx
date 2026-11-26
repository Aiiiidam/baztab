'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { AuthMember } from '@/types/auth';

const AuthContext = createContext<AuthMember | null>(null);

export function AuthProvider({
  member,
  children,
}: {
  member: AuthMember | null;
  children: ReactNode;
}) {
  return <AuthContext.Provider value={member}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthMember {
  const member = useContext(AuthContext);
  if (!member) throw new Error('useAuth must be used within AuthProvider with a signed-in member');
  return member;
}

export function useAuthOptional(): AuthMember | null {
  return useContext(AuthContext);
}
