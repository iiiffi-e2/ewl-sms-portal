/**
 * Offline CommStack delivery check (no browser session required).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/diagnose-commstack.ts <notifyClientId>
 *
 * Optional third arg: send a probe message after the lookup
 *   npx tsx --env-file=.env.local scripts/diagnose-commstack.ts <notifyClientId> --send
 */

import {
  diagnoseCommStackDirectThread,
  isCommStackConfigured,
  isCommStackUserId,
  sendCommStackDirectMessage,
  verifyCommStackAccess,
} from "../lib/commstack";

async function main() {
  const otherUserId = process.argv[2]?.trim();
  const shouldSend = process.argv.includes("--send");

  if (!otherUserId || !isCommStackUserId(otherUserId)) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/diagnose-commstack.ts <uuid> [--send]");
    process.exit(1);
  }

  if (!isCommStackConfigured()) {
    console.error("CommStack is not configured in env.");
    process.exit(1);
  }

  console.log("Verifying CommStack access...");
  await verifyCommStackAccess();
  console.log("Access OK");
  console.log({
    baseUrl: process.env.COMM_STACK_BASE_URL,
    env: process.env.COMM_STACK_ENV,
    appId: process.env.COMM_STACK_APP_ID,
    portalUserId: process.env.COMM_STACK_PORTAL_USER_ID,
  });

  if (shouldSend) {
    const probe = `CareText diag probe ${new Date().toISOString()}`;
    console.log(`Sending probe: ${probe}`);
    const result = await sendCommStackDirectMessage({
      receiverUserId: otherUserId,
      text: probe,
      senderName: "CareText Diag",
    });
    console.log("Send ack:", result);
  }

  const diagnosis = await diagnoseCommStackDirectThread({ otherUserId });
  console.log(JSON.stringify(diagnosis, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
