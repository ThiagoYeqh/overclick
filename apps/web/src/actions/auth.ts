"use server";

import {
  canCreateFirstAdmin,
  isValidEmail,
  isValidPassword,
  user,
} from "@agent-board/db";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { clearSession, setSession } from "../lib/cookies";
import { db } from "../lib/db";
import { countUsers, ensureWorkspace } from "../lib/instance";
import { hashPassword, verifyPassword } from "../lib/password";

export type AuthState = { error: string } | null;

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export async function signupAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!isValidEmail(email)) {
    return { error: "Use a valid email. It only identifies the local account." };
  }
  if (!isValidPassword(password)) {
    return { error: "The password needs at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "The passwords don't match." };
  }

  const existing = await countUsers();
  if (!canCreateFirstAdmin(existing)) {
    return { error: "This instance already has an admin. Sign in with the existing account." };
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db()
    .insert(user)
    .values({ email, passwordHash })
    .returning({ id: user.id, email: user.email });

  if (!created) {
    return { error: "Could not create the account." };
  }

  await ensureWorkspace();
  await setSession({ userId: created.id, email: created.email });
  redirect("/onboarding");
}

export async function loginAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isValidEmail(email) || !password) {
    return { error: "Invalid email or password." };
  }

  const [found] = await db()
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!found || !(await verifyPassword(password, found.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await setSession({ userId: found.id, email: found.email });
  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  await clearSession();
  redirect("/login");
}
