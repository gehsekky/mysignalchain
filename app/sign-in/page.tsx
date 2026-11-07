import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata = { title: "Sign in · mysignalchain" };

export default function SignInPage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <GoogleSignInButton />
    </div>
  );
}
