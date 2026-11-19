import { useEffect, useRef, useState } from "react";
import avatarAlvin from "../../../assets/figma/avatar-alvin.png";
import avatarRick from "../../../assets/figma/avatar-rick.png";
import type { User } from "../../../data/users";
import styles from "./ProfileMenu.module.css";

const ROLE_LABEL: Record<User["role"], string> = { firefighter: "Firefighter", paramedic: "Paramedic" };

interface ProfileMenuProps {
  user: User;
  onSignOut: () => void;
  onRestartDemo: () => void;
}

/** the app bar name opens a little menu: who's signed in, restart demo, sign out */
export function ProfileMenu({ user, onSignOut, onRestartDemo }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.fullName}, ${ROLE_LABEL[user.role]}. Open account menu`}
        onClick={() => setOpen((o) => !o)}
      >
        <img className={styles.avatar} src={user.role === "paramedic" ? avatarRick : avatarAlvin} alt="" width={38} height={38} />
        <span className={styles.whoText}>
          <span className={styles.name}>{user.fullName}</span>
          <span className={styles.role}>{ROLE_LABEL[user.role]}</span>
        </span>
      </button>

      {open && (
        <ul className={styles.menu} role="menu" aria-label="Account">
          <li className={styles.who} role="presentation">
            <div className={styles.whoName}>{user.fullName}</div>
            <div className={styles.whoOrg}>{user.org}</div>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className={[styles.item, styles.itemMuted].join(" ")} onClick={onRestartDemo}>
              <svg className={styles.itemIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M2.8 8a5.2 5.2 0 1 0 1.6-3.75" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M2.6 2.4v2.9h2.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Restart demo
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className={styles.item} onClick={onSignOut}>
              <svg className={styles.itemIcon} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6.5 2.5H4a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 4 13.5h2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M10.5 5.2 13.3 8l-2.8 2.8M13.2 8H6.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Sign out
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
