"use client";

import { useActionState } from "react";
import { loginAction, type AuthState } from "../../actions/auth";
import { dict } from "../../lib/i18n";

export function LoginForm({ lang }: { lang: string }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState<AuthState, FormData>(
    loginAction,
    null,
  );

  return (
    <form action={action}>
      <label>
        {t.auth.email}
        <input
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
        />
      </label>
      <label>
        {t.auth.password}
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? t.auth.signingIn : t.auth.signIn}
      </button>
    </form>
  );
}
