// npx tsx scripts/check-google.ts: read-only live check of the connected account. Refreshes the token, reads
// free/busy for the next two weeks and prints the two slots an invite would offer. Sends nothing, books nothing.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { mailbox } from "../src/lib/google/client";
import { offerSlots } from "../src/lib/google/outreach";
import { formatSlot } from "../src/lib/google/slots";

async function main() {
  const box = await mailbox();
  if (!box) {
    console.log("No Gmail connected. Click Connect Gmail in the app first.");
    return void (process.exitCode = 1);
  }
  console.log(`OK   token refresh for ${box.email}`);
  const slots = await offerSlots();
  console.log(`OK   calendar free/busy read; an invite would offer: ${slots.map(formatSlot).join(" or ")}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
