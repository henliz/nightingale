import { createContext, useContext, useState, type ReactNode } from "react";
import { findUser, type User } from "../data/users";

interface SessionValue {
  user: User | null;
  signIn: (user: User) => void;
  signOut: () => void;
}

const SessionContext = createContext<SessionValue | null>(null);

const STORAGE_KEY = "nightingale.session.userId";

function readStoredUser(): User | null {
  try {
    const id = sessionStorage.getItem(STORAGE_KEY);
    return id ? (findUser(id) ?? null) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: User | null) {
  try {
    if (user) sessionStorage.setItem(STORAGE_KEY, user.id);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode), session just won't survive a reload */
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);

  const signIn = (next: User) => {
    writeStoredUser(next);
    setUser(next);
  };
  const signOut = () => {
    writeStoredUser(null);
    setUser(null);
  };

  return (
    <SessionContext.Provider value={{ user, signIn, signOut }}>{children}</SessionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
