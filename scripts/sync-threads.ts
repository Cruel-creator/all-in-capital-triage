// pnpm sync:threads: checks every open thread for founder replies and due follow-ups. Prepares only; nothing is
// sent until someone clicks on the application page. Safe to run on a schedule (Phase 5 moves it to pg_cron).
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { admin, must } from "../src/lib/db/admin";
import { syncApplication } from "../src/lib/google/outreach";

const apps = must(await admin().from("threads").select("application_id").in("state", ["sent", "followed_up", "counter_proposed"]), "threads");
const ids = [...new Set(apps.map((a) => a.application_id as string))];
for (const id of ids) {
  try {
    const r = await syncApplication(id);
    console.log(id, r.length ? r.join(", ") : "nothing new");
  } catch (e) {
    console.error(id, (e as Error).message);
  }
}
console.log(`Checked ${ids.length} application(s).`);
