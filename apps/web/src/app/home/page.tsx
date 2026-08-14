import { redirect } from "next/navigation";
import { logoutAction } from "../../actions/auth";
import { getSession } from "../../lib/cookies";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      <p className="brand">instância local</p>
      <h1>Sessão ativa.</h1>
      <div className="panel">
        <p className="meta">
          Conta: {session.email}
          <br />
          Os dados ficam neste servidor. Nada é enviado para fora.
        </p>
        <form action={logoutAction}>
          <button className="ghost" type="submit">
            Sair
          </button>
        </form>
      </div>
      <p className="foot">v0.1.0 · sem analytics · sem verificação de e-mail</p>
    </>
  );
}
