import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "../../components/ui/Icon/Icon";
import type { User } from "../../data/users";
import styles from "./AccountPicker.module.css";

interface AccountPickerProps {
  users: readonly User[];
  value: User | null;
  onChange: (user: User) => void;
}

function matches(user: User, q: string) {
  const hay = `${user.id} ${user.fullName} ${user.title} ${user.org}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word));
}

// the "Username" field: type your name or username, or click to pick from the accounts on this device.
// arrow keys, enter + escape work too
export function AccountPicker({ users, value, onChange }: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // null = not typing, the field shows whoever is chosen
  const [query, setQuery] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const listId = `${id}-list`;
  const inputId = `${id}-input`;

  const shown = query ? users.filter((u) => matches(u, query)) : users;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery(null);
  }

  function openList() {
    setActive(Math.max(0, value ? users.findIndex((u) => u.id === value.id) : 0));
    setOpen(true);
  }

  function choose(user: User) {
    setOpen(false);
    setQuery(null);
    onChange(user);
  }

  function onType(text: string) {
    setQuery(text);
    setActive(0);
    setOpen(true);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openList();
        return;
      }
      if (!shown.length) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setActive((i) => (i + delta + shown.length) % shown.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const user = open ? shown[active] : undefined;
      if (user) choose(user);
      else if (!open) openList();
    } else if (e.key === "Escape") {
      close();
    }
  }

  const activeUser = open ? shown[active] : undefined;

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <label className={styles.label} htmlFor={inputId}>
        Username
      </label>
      <div className={[styles.control, open ? styles.controlOpen : ""].join(" ")} onClick={() => inputRef.current?.focus()}>
        {value && query === null && (
          <span className={[styles.mark, value.role === "firefighter" ? styles.markFire : styles.markParamedic].join(" ")} />
        )}
        <span className={styles.chosen}>
          <input
            ref={inputRef}
            id={inputId}
            className={styles.input}
            type="text"
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={activeUser ? `${id}-${activeUser.id}` : undefined}
            placeholder="Your name or username"
            value={query ?? (value ? `${value.firstName}  ·  ${value.title}` : "")}
            onChange={(e) => onType(e.target.value)}
            onFocus={(e) => {
              if (query === null) e.target.select();
            }}
            onClick={() => (open ? undefined : openList())}
            onKeyDown={onKeyDown}
          />
          {value && query === null && <span className={styles.org}>{value.org}</span>}
        </span>
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Close account list" : "Show accounts"}
          className={styles.chevronButton}
          onClick={(e) => {
            e.stopPropagation();
            if (open) close();
            else {
              inputRef.current?.focus();
              openList();
            }
          }}
        >
          <Icon name="chevron" size={18} className={[styles.chevron, open ? styles.chevronOpen : ""].join(" ")} />
        </button>
      </div>

      {open && (
        <ul className={styles.list} role="listbox" id={listId} aria-label="Accounts on this device">
          {shown.length === 0 && <li className={styles.empty}>No account here matches “{query}”.</li>}
          {shown.map((user, i) => (
            <li
              key={user.id}
              id={`${id}-${user.id}`}
              role="option"
              aria-selected={value?.id === user.id}
              className={[styles.option, i === active ? styles.optionActive : "", value?.id === user.id ? styles.optionSelected : ""].join(" ")}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
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
