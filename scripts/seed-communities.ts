// Adds the Community Brain profiles from data/communities.json to Supabase. Safe to re-run: existing names are skipped.
//   npx tsx scripts/seed-communities.ts
import fs from "node:fs";
import path from "node:path";
import { db } from "../pipeline/db";

async function main() {
  const profiles = JSON.parse(fs.readFileSync(path.resolve("data/communities.json"), "utf8")) as Array<{ name: string }>;
  const existing = await db().from("communities").select("name");
  if (existing.error) throw new Error(existing.error.message);
  const have = new Set((existing.data ?? []).map((r) => r.name));
  const rows = profiles.filter((p) => !have.has(p.name)).map((p) => ({ name: p.name, profile: p }));
  if (rows.length) {
    const res = await db().from("communities").insert(rows);
    if (res.error) throw new Error(res.error.message);
  }
  console.log(`Added ${rows.length}, skipped ${profiles.length - rows.length} that already existed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
