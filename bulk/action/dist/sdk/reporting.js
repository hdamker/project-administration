import fs from "node:fs/promises";
export async function appendCsv(pathname, row) {
    await fs.appendFile(pathname, row);
}
export async function appendJsonl(pathname, obj) {
    await fs.appendFile(pathname, JSON.stringify(obj) + "\n");
}
