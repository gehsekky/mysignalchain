/**
 * Gate for the test-only sign-in. Automated browsers can't sign in to real
 * Google accounts, so end-to-end tests use this instead. It needs both the flag
 * and a non-production build, and production builds compile this to false.
 */
export function isTestSignInEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_TEST_LOGIN_ENABLED === "true"
  );
}
