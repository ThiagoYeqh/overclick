import { eq } from "drizzle-orm";
import {
  factoryUsageRecipes,
  findUsageRecipe,
  usageRecipe,
  type Database,
  type RecipeYield,
  type UsageRecipeRow,
} from "@agent-board/db";
import { resolveCatalogCli } from "./executors";

/** Postgres or PGlite drizzle client — the query surface recipes need. */
export type RecipesDb = Pick<Database, "select">;

/**
 * The workspace recipe list: what the board ships, with any recipe the
 * workspace rewrote on top. Rows are only stored once someone edits one, so a
 * fresh instance already hands agents a working command without anyone
 * touching Settings.
 */
export async function loadUsageRecipes(
  db: RecipesDb,
  workspaceId: string,
): Promise<UsageRecipeRow[]> {
  const stored = await db
    .select()
    .from(usageRecipe)
    .where(eq(usageRecipe.workspaceId, workspaceId));

  const rows = new Map<string, UsageRecipeRow>();
  for (const row of factoryUsageRecipes()) rows.set(row.cli, row);
  for (const row of stored) {
    rows.set(row.cli, {
      cli: row.cli,
      label: row.label,
      yields: row.yields as RecipeYield,
      instructions: row.instructions,
      command: row.command,
      source: "custom",
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return [...rows.values()];
}

/**
 * The recipe for the CLI that claimed the card. Agents send the binary name
 * ("claude"); the catalog resolves it to the id the recipes are keyed by, and
 * anything unknown lands on the generic recipe rather than on nothing.
 */
export function recipeForCli(
  recipes: readonly UsageRecipeRow[],
  cli: string | null | undefined,
): UsageRecipeRow | null {
  const raw = (cli ?? "").trim();
  const resolved = raw ? (resolveCatalogCli(raw) ?? raw) : null;
  return findUsageRecipe(recipes, resolved);
}
