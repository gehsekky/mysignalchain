import Link from "next/link";
import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata = { title: "Sign in · mysignalchain" };

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <GoogleSignInButton />
      <p className="text-muted-foreground text-sm">
        By signing in you agree to how we handle your data, described in our{" "}
        <Link
          href="/privacy"
          className="text-foreground underline underline-offset-4"
        >
          privacy policy
        </Link>
        .
      </p>
    </div>
  );
}
