import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Runs one of the CJS maintenance scripts as a child process, streaming its
 * output to the container log and resolving with the last line it printed.
 *
 * That last line is what the admin page shows, which is why the scripts end
 * with a summary. Rejecting on a non-zero exit is what turns into the "failed"
 * job status.
 */
export function runScript(script: string, args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", script);
    const startedAt = Date.now();
    const child = spawn(process.execPath, [scriptPath, ...args], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const tag = `[${script}]`;
    let lastSummary = "";
    const errorTail: string[] = [];

    // A line of punctuation is the tail of a dumped error object, not a
    // message. sync.cjs console.errors the whole Error, so the literal last
    // line of a failed run is "}".
    const isMeaningful = (line: string) => /[a-zA-Z0-9]/.test(line);

    const linesOf = (text: string) =>
      text.split("\n").map((l) => l.trim()).filter((l) => l !== "");

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(`${tag} ${text}`);
      // Scripts print a summary last, so the final meaningful line is the most
      // useful single thing to show without a log viewer.
      const lines = linesOf(text).filter(isMeaningful);
      if (lines.length > 0) lastSummary = lines[lines.length - 1];
    });

    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(`${tag} ${text}`);
      errorTail.push(...linesOf(text).filter(isMeaningful));
      // Only the last few matter, and this must not grow without bound on a
      // script that fails noisily.
      if (errorTail.length > 5) errorTail.splice(0, errorTail.length - 5);
    });

    child.on("exit", (code) => {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      if (code === 0) {
        resolve(`${lastSummary || "completed"} (${seconds}s)`);
        return;
      }

      const detail = errorTail.length > 0 ? errorTail.join(" · ") : lastSummary;
      reject(
        new Error(
          `${script} exited with code ${code} after ${seconds}s` +
            (detail ? `: ${detail.slice(0, 500)}` : ""),
        ),
      );
    });

    child.on("error", (err) => {
      reject(new Error(`could not start ${script}: ${err.message}`));
    });
  });
}
