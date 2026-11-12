import { useState } from "react";

export type Theme = "day" | "night";
const KEY = "nightingale.theme";

function read(): Theme {
  try {
    return localStorage.getItem(KEY) === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

/** sets the theme on <html> before react renders so there's no flash */
export function applyStoredTheme() {
  document.documentElement.dataset.theme = read();
}

/** day / night (truck) mode, remembered per browser */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(read);
  return [
    theme,
    (next) => {
      setTheme(next);
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // private window, it just won't stick
      }
    },
  ];
}
