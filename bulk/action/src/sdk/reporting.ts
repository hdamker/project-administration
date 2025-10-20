import fs from "node:fs/promises";

export async function appendJsonl(pathname: string, obj: Record<string, any>) {
  await fs.appendFile(pathname, JSON.stringify(obj) + "\n");
}
