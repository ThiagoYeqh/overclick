import { canCreateFirstAdmin } from "@agent-board/db";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/cookies";
import { countUsers } from "../../lib/instance";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/home");

  const users = await countUsers();
  if (canCreateFirstAdmin(users)) redirect("/setup");

  return (
    <>
      <p className="brand">self-hosted · open source · mit</p>
      <h1>Welcome back.</h1>
      <p className="sub">Sign in with this local instance&apos;s admin account.</p>
      <LoginForm />
      <p className="foot">v0.1.1 · local instance · no data sent anywhere</p>
    </>
  );
}
