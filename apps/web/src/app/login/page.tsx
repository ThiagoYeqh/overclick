import { canCreateFirstAdmin } from "@agent-board/db";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { dict } from "../../lib/i18n";
import { countUsers } from "../../lib/instance";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/home");

  const users = await countUsers();
  if (canCreateFirstAdmin(users)) redirect("/setup");

  const ws = await db().query.workspace.findFirst();
  const t = dict(ws?.language);

  return (
    <>
      <p className="brand">{t.auth.brand}</p>
      <h1>{t.auth.loginTitle}</h1>
      <p className="sub">{t.auth.loginSub}</p>
      <LoginForm lang={ws?.language ?? "en"} />
      <p className="foot">v0.1.1 · {t.auth.foot}</p>
    </>
  );
}
