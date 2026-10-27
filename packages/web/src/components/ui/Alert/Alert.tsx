import styles from "./Alert.module.css";

export type AlertTone = "warning" | "info" | "success";

interface AlertProps {
  tone: AlertTone;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}

export function Alert({ tone, title, body, action }: AlertProps) {
  return (
    <div className={[styles.alert, styles[tone]].join(" ")} role="status">
      <span className={styles.dot} />
      <div className={styles.text}>
        <p className={styles.title}>{title}</p>
        <p className={styles.body}>{body}</p>
      </div>
      {action && (
        <button type="button" className={styles.action} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
