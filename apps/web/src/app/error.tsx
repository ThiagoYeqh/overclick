"use client";

export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const missingDb = /DATABASE_URL/.test(error.message);

  return (
    <>
      <p className="brand">instância local</p>
      <h1>{missingDb ? "Falta o banco." : "Algo quebrou aqui."}</h1>
      <p className="sub">
        {missingDb
          ? "Defina DATABASE_URL apontando para o Postgres desta instância. Nada é enviado para fora."
          : "O erro ficou neste servidor. Não há telemetria — olhe os logs do container."}
      </p>
    </>
  );
}
