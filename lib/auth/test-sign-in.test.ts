import { afterEach, describe, expect, it, vi } from "vitest";
import { isTestSignInEnabled } from "./test-sign-in";

afterEach(() => vi.unstubAllEnvs());

describe("isTestSignInEnabled", () => {
  it("needs the flag", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_LOGIN_ENABLED", "false");
    expect(isTestSignInEnabled()).toBe(false);
  });

  it("is on with the flag outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("E2E_TEST_LOGIN_ENABLED", "true");
    expect(isTestSignInEnabled()).toBe(true);
  });

  it("is off in production even with the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_TEST_LOGIN_ENABLED", "true");
    expect(isTestSignInEnabled()).toBe(false);
  });
});
