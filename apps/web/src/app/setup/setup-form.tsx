"use client";

import { useActionState, useMemo, useState } from "react";
import { signupAction, type AuthState } from "../../actions/auth";
import { dict } from "../../lib/i18n";

export function SetupForm({ lang }: { lang: string }) {
  const t = dict(lang);
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signupAction,
    null,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const valid = useMemo(() => {
    return (
      email.includes("@") &&
      password.length >= 8 &&
      confirm === password
    );
  }, [email, password, confirm]);

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label>
        {t.auth.password}
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label>
        {t.auth.confirmPassword}
        <input
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <button type="submit" disabled={!valid || pending}>
        {pending ? t.auth.creating : t.auth.createAccount}
      </button>
    </form>
  );
}
