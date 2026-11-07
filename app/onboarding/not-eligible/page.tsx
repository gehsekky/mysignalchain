export const metadata = { title: "Can't create an account · mysignalchain" };

export default function NotEligiblePage() {
  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        We can&apos;t create your account
      </h1>
      <p className="text-muted-foreground">
        You need to be at least 13 to use mysignalchain. We&apos;ve deleted the
        account details from this sign-up.
      </p>
    </div>
  );
}
