import { z } from "zod";
import { isTestSignInEnabled } from "@/lib/auth/test-sign-in";

const bodySchema = z.object({ email: z.email() });

export async function POST(request: Request) {
  if (!isTestSignInEnabled()) {
    return new Response(null, { status: 404 });
  }

  const body = bodySchema.safeParse(await request.json());
  if (!body.success) return new Response(null, { status: 400 });

  const { createTestAuth } = await import("@/lib/auth/test-auth");
  const { test } = await createTestAuth().$context;
  const user = await test.saveUser(
    test.createUser({ email: body.data.email, name: "Test User" }),
  );
  const { cookies } = await test.login({ userId: user.id });

  const response = Response.json({ userId: user.id });
  for (const cookie of cookies) {
    response.headers.append(
      "Set-Cookie",
      `${cookie.name}=${cookie.value}; Path=/; HttpOnly; SameSite=Lax`,
    );
  }
  return response;
}
