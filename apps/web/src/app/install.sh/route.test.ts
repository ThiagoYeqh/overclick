import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /install.sh", () => {
  it("serves the canonical root installer as shell text", async () => {
    const response = await GET();
    const canonical = await readFile(resolve(process.cwd(), "../../install.sh"), "utf8");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-shellscript");
    expect(await response.text()).toBe(canonical);
  });
});
