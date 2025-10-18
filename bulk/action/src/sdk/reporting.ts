import fs from "node:fs/promises";
export async function appendCsv(pathname: string, row: string) { await fs.appendFile(pathname, row); }
