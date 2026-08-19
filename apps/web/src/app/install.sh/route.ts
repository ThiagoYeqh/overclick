import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readInstaller() {
  return readFile(
    /* turbopackIgnore: true */ resolve(process.cwd(), "../../install.sh"),
    "utf8",
  );
}

export async function GET() {
  return new Response(await readInstaller(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Disposition": 'inline; filename="install.sh"',
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
