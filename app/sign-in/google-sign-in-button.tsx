"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

export function GoogleSignInButton() {
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setFailed(false);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });
    if (error) setFailed(true);
  }

  return (
    <>
      <Button onClick={signIn}>Continue with Google</Button>
      {failed && (
        <p role="alert" className="text-destructive text-sm">
          Couldn&apos;t start sign-in with Google. Please try again.
        </p>
      )}
    </>
  );
}
