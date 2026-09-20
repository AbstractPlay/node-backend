import { closeSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function pipelineLockPath(stage) {
    return join(tmpdir(), `abstractplay-run-records-pipeline-${stage}.lock`);
}

/**
 * One manual pipeline per machine/stage (does not stop other machines or EventBridge).
 */
export function acquirePipelineLock(stage) {
    const path = pipelineLockPath(stage);
    try {
        const fd = openSync(path, "wx");
        const meta = `${process.pid}\n${new Date().toISOString()}\n`;
        writeSync(fd, meta);
        return { fd, path };
    } catch (err) {
        if (err?.code === "EEXIST") {
            let existing = "(could not read lock file)";
            try {
                existing = readFileSync(path, "utf8");
            } catch {
                // ignore
            }
            throw new Error(
                `Another run-records-pipeline is already running for stage "${stage}" (lock: ${path}).\n`
                + `${existing}\n`
                + "Stop that process first, or remove the lock file only if you are sure nothing is running.",
            );
        }
        throw err;
    }
}

export function releasePipelineLock(lock) {
    if (!lock) {
        return;
    }
    try {
        closeSync(lock.fd);
    } catch {
        // ignore
    }
    try {
        unlinkSync(lock.path);
    } catch {
        // ignore
    }
}
