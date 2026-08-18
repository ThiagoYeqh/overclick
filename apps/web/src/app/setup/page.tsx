import { canCreateFirstAdmin } from "@agent-board/db";
import { redirect } from "next/navigation";
import { NebulaAtmosphere } from "../../components/nebula-atmosphere";
import { getSession } from "../../lib/cookies";
import { db } from "../../lib/db";
import { dict } from "../../lib/i18n";
import { countUsers } from "../../lib/instance";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await getSession();
  if (session) redirect("/home");

  const users = await countUsers();
  if (!canCreateFirstAdmin(users)) redirect("/login");

  // Pre-setup there is usually no workspace yet; dict falls back to English.
  const ws = await db().query.workspace.findFirst();
  const t = dict(ws?.language);

  return (
    <div className="nb nebula-surface nb-center nb-auth">
      <NebulaAtmosphere />
      <div className="stage">
        <div className="panel auth-card nebula-glass">
          <p className="brand">{t.auth.brand}</p>
          <h1>{t.auth.setupTitle}</h1>
          <p className="sub">{t.auth.setupSub}</p>
          <SetupForm lang={ws?.language ?? "en"} />
          <p className="foot">v0.1.10 · {t.auth.foot}</p>
        </div>
      </div>
    </div>
  );
}
