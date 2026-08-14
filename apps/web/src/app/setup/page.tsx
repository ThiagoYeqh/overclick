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
      <h1>Seu board acabou de subir.</h1>
      <p className="sub">
        Crie a conta admin desta instância. Ela fica no seu banco — nada sai
        daqui.
      </p>
      <SetupForm />
      <p className="foot">v0.1.0 · instância local · nenhum dado enviado para fora</p>
    </>
  );
}
