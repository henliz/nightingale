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

// who's signed in, for the dev proxy only: it swaps this for that person's api key server-side,
// so no key ever lands in the browser (photos + the live feed can't send headers, a cookie rides along)
function writeUserCookie(user: User | null) {
  document.cookie = user ? `ng_user=${encodeURIComponent(user.id)}; path=/; SameSite=Strict` : "ng_user=; path=/; max-age=0; SameSite=Strict";
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = readStoredUser();
    writeUserCookie(stored);
    return stored;
  });

  const signIn = (next: User) => {
    writeStoredUser(next);
    writeUserCookie(next);
    setUser(next);
  };
  const signOut = () => {
    writeStoredUser(null);
    writeUserCookie(null);
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
