import { useEffect, useRef, useState } from "react";
import avatar from "../../../assets/figma/avatar-alvin.png";
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
        <img className={styles.avatar} src={avatar} alt="" width={38} height={38} />
        <span>
          <span className={styles.name}>{user.fullName}</span>
          <br />
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
              Restart demo
            </button>
          </li>
          <li role="none">
            <button type="button" role="menuitem" className={styles.item} onClick={onSignOut}>
              Sign out
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
