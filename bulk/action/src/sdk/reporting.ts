import fs from "node:fs/promises";

export async function appendCsv(pathname: string, row: string) {
  await fs.appendFile(pathname, row);
}

export async function appendJsonl(pathname: string, obj: Record<string, any>) {
  await fs.appendFile(pathname, JSON.stringify(obj) + "\n");
}
