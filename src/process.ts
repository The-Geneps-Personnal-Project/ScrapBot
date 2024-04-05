import { exec } from "child_process";

function execCommand(cmd: string) {
    return new Promise((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(stdout);
        });
    });
}

export function pushCommand(backup: Number) {
    return execCommand(`git add . && git commit -m "Backup ${backup}" && git push`);
}

export function pullCommand() {
    return execCommand("git pull");
}

export function cleanChrome() {
    return execCommand("pkill chromium");
}
