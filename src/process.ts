import { exec } from "child_process";

export function execCommand(cmd: string) {
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
