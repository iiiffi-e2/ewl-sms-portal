import { loadEnvConfig } from "@next/env";
import twilio from "twilio";

// Standalone scripts don't get Next.js's automatic env loading, so load
// .env / .env.local the same way the app does before reading process.env.
loadEnvConfig(process.cwd());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
const projectedAddress = process.env.TWILIO_GROUP_PROJECTED_ADDRESS;
const testPhone1 = process.env.GROUP_TEST_PHONE_1;
const testPhone2 = process.env.GROUP_TEST_PHONE_2;

if (!accountSid || !authToken || !messagingServiceSid || !projectedAddress || !testPhone1 || !testPhone2) {
  console.error(
    "Missing env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID, TWILIO_GROUP_PROJECTED_ADDRESS, GROUP_TEST_PHONE_1, GROUP_TEST_PHONE_2",
  );
  process.exit(1);
}

const client = twilio(accountSid, authToken);

// IMPORTANT: conversationWithParticipants takes `participant` as an array of
// STRINGIFIED JSON (snake_case keys), NOT objects with dotted keys. This uses
// the default Conversations Service; the Messaging Service routes the SMS/MMS.
async function main() {
  console.log("Creating group conversation with 2 SMS participants + projected address...");

  const conversation = await client.conversations.v1.conversationWithParticipants.create({
    friendlyName: "CareText Group MMS Spike",
    messagingServiceSid,
    participant: [
      JSON.stringify({ messaging_binding: { address: testPhone1 } }),
      JSON.stringify({ messaging_binding: { address: testPhone2 } }),
      JSON.stringify({ messaging_binding: { projected_address: projectedAddress } }),
    ],
  });

  console.log("Conversation SID:", conversation.sid, "state:", conversation.state);

  // The conversation is created in `initializing` state; participants are added
  // asynchronously and state flips to `active`. Poll until active before sending.
  let state = conversation.state;
  for (let attempt = 0; attempt < 10 && state !== "active"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const refreshed = await client.conversations.v1.conversations(conversation.sid).fetch();
    state = refreshed.state;
    console.log("  polling state:", state);
  }

  if (state !== "active") {
    console.error("Conversation did not reach active state. Check Twilio error logs.");
    process.exit(1);
  }

  const message = await client.conversations.v1
    .conversations(conversation.sid)
    .messages.create({
      author: projectedAddress,
      body: "CareText group MMS verification — if you see this in a group thread with both numbers, the spike passed.",
    });

  console.log("Message SID:", message.sid);
  console.log("\nCheck both test phones for a NATIVE group MMS thread (not separate 1:1 texts).");
  console.log("If messages do not arrive or appear as 1:1, STOP and contact Twilio support before continuing.");
}

main().catch((error) => {
  console.error("Spike failed:", error);
  process.exit(1);
});
