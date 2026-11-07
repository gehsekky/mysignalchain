import { getDb } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

// Development data only. M1 adds the gear catalog here.
if (process.env.NODE_ENV === "production") {
  throw new Error("The seed script is for development only");
}

async function main() {
  await getDb()
    .insert(users)
    .values({
      id: "seed-user",
      name: "Demo Guitarist",
      email: "demo@example.com",
      emailVerified: true,
      handle: "demo",
      ageCheckPassedAt: new Date(),
    })
    .onConflictDoNothing();
  console.log("Seed data applied");
  process.exit(0);
}

void main();
