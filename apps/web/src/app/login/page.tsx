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
      <h1>Bem-vindo de volta.</h1>
      <p className="sub">Entre com a conta admin desta instância local.</p>
      <LoginForm />
      <p className="foot">v0.1.0 · instância local · nenhum dado enviado para fora</p>
    </>
  );
}
