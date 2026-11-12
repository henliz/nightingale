// the laptop's crash pad (oct 19 2026). the pi deletes a file the moment the laptop says
// "verified", so before saying that, the exact bytes it sent get written here: flushed
// to disk, read-only, listed in a sha256 manifest. if this fails the pi is told no and
// keeps its copy. everything else (drills/, transcription, the dashboard) works off
// copies and can fail without anything being lost.
//
//   <dir>/<captureId>/<captureId>__<pi stamp>.wav|jpg   same name it had on the pi
//   <dir>/manifest.sha256                                `shasum -a 256 -c` format
//
// a re-upload of the same file (pi retried after a dropped answer) is recognised by its
// sha256 and not written twice

import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export interface Crashpad {
  /** returns where it was saved, throws if it couldn't be saved safely */
  save(input: { captureId: string; piStamp?: number; kind: "audio" | "photo"; bytes: Uint8Array }): string;
}

export const noopCrashpad: Crashpad = { save: () => "" };

const fsyncDir = (dir: string) => {
  const fd = openSync(dir, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
};

// device ids come from the pi, keep them to plain file-name characters
const safe = (s: string) => s.replace(/[^A-Za-z0-9_.-]/g, "_");

export function createFsCrashpad(dir: string): Crashpad {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  const manifest = path.join(dir, "manifest.sha256");
  if (!existsSync(manifest)) writeFileSync(manifest, "", { mode: 0o600 });
  chmodSync(manifest, 0o600);
  const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

  return {
    save({ captureId, piStamp, kind, bytes }) {
      const ext = kind === "audio" ? "wav" : "jpg";
      const folder = path.join(dir, safe(captureId));
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      chmodSync(folder, 0o700);
      const hash = sha(bytes);
      const base = `${safe(captureId)}__${piStamp ?? `nostamp-${Date.now()}`}`;

      // same name already there: same bytes = a retry, done. different bytes = keep both
      let name = `${base}.${ext}`;
      for (let n = 1; existsSync(path.join(folder, name)); n++) {
        if (sha(readFileSync(path.join(folder, name))) === hash) return path.join(folder, name);
        name = `${base}.dup${n}.${ext}`;
      }

      const file = path.join(folder, name);
      const fd = openSync(file, "wx"); // never overwrites
      try {
        let off = 0;
        while (off < bytes.length) off += writeSync(fd, bytes, off, bytes.length - off);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      chmodSync(file, 0o444);
      fsyncDir(folder);

      const line = `${hash}  ${path.relative(dir, file)}\n`;
      const mfd = openSync(manifest, "a", 0o600);
      try {
        writeSync(mfd, line);
        fsyncSync(mfd);
      } finally {
        closeSync(mfd);
      }
      fsyncDir(dir);
      return file;
    },
  };
}
