/**
 * Offline CommStack delivery check (no browser session required).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/diagnose-commstack.ts <notifyClientId>
 *
 * Optional third arg: send a probe message after the lookup
 *   npx tsx --env-file=.env.local scripts/diagnose-commstack.ts <notifyClientId> --send
 *
 * Loads CommStack credentials from the Contact row in the database.
 */

import { PrismaClient } from "@prisma/client";
import {
  diagnoseCommStackDirectThread,
  getContactCommStackConfig,
  hasContactCommStackConfig,
  isCommStackConfigured,
  isCommStackUserId,
  sendCommStackDirectMessage,
  verifyCommStackAccess,
} from "../lib/commstack";

const prisma = new PrismaClient();

async function main() {
  const otherUserId = process.argv[2]?.trim();
  const shouldSend = process.argv.includes("--send");

  if (!otherUserId || !isCommStackUserId(otherUserId)) {
    console.error("Usage: npx tsx --env-file=.env.local scripts/diagnose-commstack.ts <uuid> [--send]");
    process.exit(1);
  }

  if (!isCommStackConfigured()) {
    console.error("CommStack is not configured. Set COMM_STACK_ENV to 'dev' or 'production'.");
    process.exit(1);
  }

  const contact = await prisma.contact.findUnique({
    where: { notifyClientId: otherUserId },
  });

  if (!contact) {
    console.error("No local contact found for that Notify client UUID.");
    process.exit(1);
  }

  if (!hasContactCommStackConfig(contact)) {
    console.error("Contact is missing CommStack settings (APP_ID, APP_NAME, BASE_URL, PORTAL_USER_ID).");
    process.exit(1);
  }

  const config = getContactCommStackConfig(contact);

  console.log("Verifying CommStack access...");
  await verifyCommStackAccess(config);
  console.log("Access OK");
  console.log({
    baseUrl: config.baseUrl,
    env: config.env,
    appId: config.appId,
    appName: config.appName,
    portalUserId: config.portalUserId,
  });

  if (shouldSend) {
    const probe = `CareText diag probe ${new Date().toISOString()}`;
    console.log(`Sending probe: ${probe}`);
    const result = await sendCommStackDirectMessage(config, {
      receiverUserId: otherUserId,
      text: probe,
      senderName: "CareText Diag",
    });
    console.log("Send ack:", result);
  }

  const diagnosis = await diagnoseCommStackDirectThread(config, { otherUserId });
  console.log(JSON.stringify(diagnosis, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
