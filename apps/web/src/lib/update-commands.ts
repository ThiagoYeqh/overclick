/**
 * The two commands the UI offers, in their own module because both the
 * server pages and the client components show them, and everything else in
 * `updates.ts` reads the filesystem: importing that from a client component
 * drags `node:fs` into the browser bundle.
 */

/**
 * The one command that turns the updater on. It is a compose profile, so
 * enabling it is opt-in and the tradeoff stays explicit: that container gets
 * the docker socket, which is root on the host.
 */
export const UPDATER_ENABLE_COMMAND = "docker compose --profile updater up -d";

/**
 * What to run by hand when nobody wants a sidecar holding the socket. It
 * matches the documented install, a git checkout that builds its own image.
 */
export const UPDATE_COMMAND = "git pull && docker compose up -d --build";

/**
 * What updates an instance started from the checkout itself, `next dev` or a
 * built node process on the host. No container exists to pull or recreate, so
 * the code is refreshed in place and the process is restarted by whoever
 * started it.
 */
export const SOURCE_UPDATE_COMMAND =
  "git pull && pnpm install && pnpm --filter @agent-board/mcp-core build";
