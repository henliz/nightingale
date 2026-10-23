import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** An SVG string for `text`, or null while it renders. */
export function useQrSvg(text: string): string | null {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(text, { type: "svg", margin: 0, color: { dark: "#202b3d", light: "#ffffff" } })
      .then((out) => {
        if (!cancelled) setSvg(out);
      })
      .catch(() => {
        if (!cancelled) setSvg(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);
  return svg;
}
