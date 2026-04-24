import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { Resend } from "resend";
import type { Env } from "./env";
import { getDb } from "./db/client";
import * as schema from "./db/schema";

export type Auth = ReturnType<typeof createAuth>;

/**
 * Create a Better Auth instance bound to the current request's Cloudflare env.
 * Better Auth needs to be re-instantiated per-request because the D1 binding
 * is not available at module load time in Workers.
 */
export function createAuth(env: Env) {
  const db = getDb(env.DB);
  const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
  const fromEmail = env.RESEND_FROM_EMAIL || "Kanban <noreply@example.com>";
  const baseURL = env.APP_URL || "http://localhost:5173";

  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),

    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true,
      sendResetPassword: async ({ user, url }) => {
        if (!resend) {
          console.warn("[auth] RESEND_API_KEY not set; reset link:", url);
          return;
        }
        await resend.emails.send({
          from: fromEmail,
          to: user.email,
          subject: "Reset your Kanban password",
          html: passwordResetEmail(url),
        });
      },
    },

    emailVerification: {
      sendOnSignUp: false,
      sendVerificationEmail: async ({ user, url }) => {
        if (!resend) {
          console.warn("[auth] RESEND_API_KEY not set; verify link:", url);
          return;
        }
        await resend.emails.send({
          from: fromEmail,
          to: user.email,
          subject: "Verify your Kanban email",
          html: verifyEmail(url),
        });
      },
    },

    socialProviders: {
      ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {}),
      ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? {
            github: {
              clientId: env.GITHUB_CLIENT_ID,
              clientSecret: env.GITHUB_CLIENT_SECRET,
            },
          }
        : {}),
    },

    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          if (!resend) {
            console.warn("[auth] RESEND_API_KEY not set; magic link:", url);
            return;
          }
          await resend.emails.send({
            from: fromEmail,
            to: email,
            subject: "Your Kanban sign-in link",
            html: magicLinkEmail(url),
          });
        },
      }),
    ],

    advanced: {
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: baseURL.startsWith("https://"),
      },
    },

    trustedOrigins: [baseURL],
  });
}

// ────────────────────────────────────────────────────────────────────
// Email templates (kept inline + minimal — easy to swap for React Email)
// ────────────────────────────────────────────────────────────────────

function shell(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:32px;color:#0f172a">
    <div style="max-width:480px;margin:0 auto;background:white;border-radius:12px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05)">
      <h1 style="margin:0 0 16px;font-size:20px">${title}</h1>
      ${body}
      <p style="margin-top:32px;color:#64748b;font-size:12px">Kanban — keep your projects moving.</p>
    </div></body></html>`;
}

function magicLinkEmail(url: string): string {
  return shell(
    "Sign in to Kanban",
    `<p>Click the button below to sign in. This link expires in 10 minutes.</p>
     <p><a href="${url}" style="display:inline-block;background:#0ea5e9;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Sign in</a></p>
     <p style="color:#64748b;font-size:13px">If you didn't request this, you can safely ignore this email.</p>`,
  );
}

function verifyEmail(url: string): string {
  return shell(
    "Verify your email",
    `<p>Confirm your email address to finish setting up your Kanban account.</p>
     <p><a href="${url}" style="display:inline-block;background:#0ea5e9;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Verify email</a></p>`,
  );
}

function passwordResetEmail(url: string): string {
  return shell(
    "Reset your password",
    `<p>We received a request to reset your password. Click below to choose a new one.</p>
     <p><a href="${url}" style="display:inline-block;background:#0ea5e9;color:white;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
     <p style="color:#64748b;font-size:13px">If you didn't request this, you can ignore this email.</p>`,
  );
}
