import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../../components/ui/Icon/Icon";
import type { User } from "../../data/users";
import styles from "./AccountPicker.module.css";

interface AccountPickerProps {
  users: readonly User[];
  value: User | null;
  onChange: (user: User) => void;
}

// the "Username" field. looks like an input but clicking it lists who's signed up on this
// device so nobody has to type. arrow keys, enter + escape work too
export function AccountPicker({ users, value, onChange }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function choose(user: User) {
    onChange(user);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + users.length) % users.length);
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      const user = users[active];
      if (user) choose(user);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label} id={`${listId}-label`}>
        Username
      </label>
      <button
        type="button"
        className={[styles.control, open ? styles.controlOpen : ""].join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${listId}-label`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onKeyDown}
      >
        {value ? (
          <>
            <span className={[styles.mark, value.role === "firefighter" ? styles.markFire : styles.markParamedic].join(" ")} />
            <span className={styles.chosen}>
              <span className={styles.name}>
                {value.firstName}&nbsp;&nbsp;·&nbsp;&nbsp;{value.title}
              </span>
              <span className={styles.org}>{value.org}</span>
            </span>
          </>
        ) : (
          <span className={styles.placeholder}>Choose your account</span>
        )}
        <Icon name="chevron" size={18} className={[styles.chevron, open ? styles.chevronOpen : ""].join(" ")} />
      </button>

      {open && (
        <ul className={styles.list} role="listbox" id={listId} aria-labelledby={`${listId}-label`}>
          {users.map((user, i) => (
            <li
              key={user.id}
              role="option"
              aria-selected={value?.id === user.id}
              className={[styles.option, i === active ? styles.optionActive : "", value?.id === user.id ? styles.optionSelected : ""].join(" ")}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(user)}
            >
              <span className={[styles.mark, user.role === "firefighter" ? styles.markFire : styles.markParamedic].join(" ")} />
              <span className={styles.chosen}>
                <span className={styles.name}>
                  {user.firstName}&nbsp;&nbsp;·&nbsp;&nbsp;{user.title}
                </span>
                <span className={styles.org}>{user.org}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
