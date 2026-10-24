import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { USERS, type User } from "../../data/users";
import { useSession } from "../../session/SessionContext";
import { Icon } from "../../components/ui/Icon/Icon";
import { AccountPicker } from "./AccountPicker";
import styles from "./SignInPage.module.css";

const HOME_BY_ROLE: Record<User["role"], string> = {
  firefighter: "/fire",
  paramedic: "/paramedic",
};

/** any 4-digit PIN unlocks the shared department device in this prototype */
const PIN_PATTERN = /^\d{4}$/;

export function SignInPage() {
  const { signIn } = useSession();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  function complete(user: User) {
    signIn(user);
    navigate(HOME_BY_ROLE[user.role], { replace: true });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) {
      setError("Choose your account first.");
      return;
    }
    if (!PIN_PATTERN.test(pin)) {
      setError("Enter the 4-digit device PIN.");
      pinRef.current?.focus();
      return;
    }
    complete(selected);
  }

  function handleChoose(user: User) {
    setSelected(user);
    setPin("");
    setError(null);
    // PIN field shows up once someone's picked, put the cursor there
    requestAnimationFrame(() => pinRef.current?.focus());
  }

  function handlePinChange(next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 4);
    setPin(digits);
    setError(null);
    // 4 digits = signed in, no extra button
    if (digits.length === 4 && selected) complete(selected);
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={handleSubmit} noValidate>
        <p className={styles.brand}>Medfi</p>
        <h1 className={styles.heading}>Sign in on the department device</h1>
        <p className={styles.lede}>Choose your account for this shift. Everyone has a personal account under their service.</p>

        <AccountPicker users={USERS} value={selected} onChange={handleChoose} />

        {selected && (
          <div className={styles.pin}>
            <label className={styles.sectionLabel} htmlFor="device-pin">
              Device PIN
            </label>
            <div className={styles.pinField}>
              <Icon name="lock" size={16} />
              <input
                ref={pinRef}
                id="device-pin"
                className={styles.pinInput}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "pin-error" : undefined}
              />
            </div>
            <p className={styles.hint}>Enter the 4-digit PIN for {selected.firstName}. The demo accepts 1234.</p>
          </div>
        )}
        {error && (
          <p className={styles.error} id="pin-error" role="alert">
            {error}
          </p>
        )}

        <p className={styles.footnote}>Department device. Personal phones are never used for patient records.</p>
        <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
      </form>
    </main>
  );
}
