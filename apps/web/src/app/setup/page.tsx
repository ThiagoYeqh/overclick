import { canCreateFirstAdmin } from "@agent-board/db";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/cookies";
import { countUsers } from "../../lib/instance";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await getSession();
  if (session) redirect("/home");

  const users = await countUsers();
  if (!canCreateFirstAdmin(users)) redirect("/login");

  return (
    <>
      <p className="brand">self-hosted · open source · mit</p>
      <h1>Your board just came up.</h1>
      <p className="sub">
        Create this instance&apos;s admin account. It lives in your database,
        nothing leaves this server.
      </p>
      <SetupForm />
      <p className="foot">v0.1.0 · local instance · no data sent anywhere</p>
    </>
  );
}
