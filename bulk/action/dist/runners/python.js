import { spawn } from "node:child_process";
export async function runPythonOp(pyFile, payload) {
    return new Promise((resolve, reject) => {
        const p = spawn("python", [pyFile], { stdio: ["pipe", "pipe", "pipe"] });
        let out = "";
        let err = "";
        p.stdout.on("data", (d) => (out += d.toString()));
        p.stderr.on("data", (d) => (err += d.toString()));
        p.on("error", reject);
        p.on("close", (code) => {
            if (code !== 0)
                return reject(new Error(`python exited ${code}: ${err}`));
            try {
                resolve(out ? JSON.parse(out) : {});
            }
            catch (e) {
                reject(new Error(`invalid JSON from python: ${e}\nstdout:\n${out}\nstderr:\n${err}`));
            }
        });
        p.stdin.write(JSON.stringify(payload));
        p.stdin.end();
    });
}
