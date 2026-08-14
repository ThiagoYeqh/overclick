"use client";

export default function ErrorPage({
  error,
}: {
  error: Error & { digest?: string };
}) {
  const missingDb = /DATABASE_URL/.test(error.message);

  return (
    <>
      <p className="brand">local instance</p>
      <h1>{missingDb ? "The database is missing." : "Something broke here."}</h1>
      <p className="sub">
        {missingDb
          ? "Set DATABASE_URL pointing to this instance's Postgres. Nothing is sent anywhere."
          : "The error stayed on this server. There is no telemetry, check the container logs."}
      </p>
    </>
  );
}
