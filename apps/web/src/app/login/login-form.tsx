"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "../../actions/auth";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={action}>
      <label>
        E-mail
        <input
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
        />
      </label>
      <label>
        Senha
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
