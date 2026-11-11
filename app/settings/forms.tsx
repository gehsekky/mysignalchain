"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { handleAction, profileAction, type SettingsState } from "./actions";

function Feedback({ state }: { state: SettingsState }) {
  if (state.error) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {state.error}
      </p>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="text-muted-foreground text-sm">
        {state.message}
      </p>
    );
  }
  return null;
}

export function ProfileForm({
  displayName,
  bio,
}: {
  displayName: string;
  bio: string;
}) {
  const [state, action, pending] = useActionState(profileAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input
          id="displayName"
          name="displayName"
          maxLength={50}
          required
          defaultValue={displayName}
        />
        {state.fieldErrors?.displayName && (
          <p role="alert" className="text-destructive text-sm">
            {state.fieldErrors.displayName[0]}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio (optional)</Label>
        <Input id="bio" name="bio" maxLength={160} defaultValue={bio} />
        <p className="text-muted-foreground text-sm">Up to 160 characters.</p>
        {state.fieldErrors?.bio && (
          <p role="alert" className="text-destructive text-sm">
            {state.fieldErrors.bio[0]}
          </p>
        )}
      </div>
      <Feedback state={state} />
      <Button type="submit" disabled={pending} className="self-start">
        Save
      </Button>
    </form>
  );
}

export function HandleForm({
  handle,
  nextChange,
}: {
  handle: string;
  nextChange: string | null;
}) {
  const [state, action, pending] = useActionState(handleAction, {});
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="handle">Handle</Label>
        <Input
          id="handle"
          name="handle"
          maxLength={30}
          required
          defaultValue={handle}
          disabled={nextChange !== null}
        />
        <p className="text-muted-foreground text-sm">
          {nextChange
            ? `You can change it again on ${nextChange}.`
            : "You can change it once every 30 days. Links to your old handle keep working, and nobody else can take it."}
        </p>
      </div>
      <Feedback state={state} />
      <Button
        type="submit"
        disabled={pending || nextChange !== null}
        className="self-start"
      >
        Change handle
      </Button>
    </form>
  );
}
