import { loadEnvConfig } from "@next/env";
import twilio from "twilio";

// Standalone scripts don't get Next.js's automatic env loading, so load
// .env / .env.local the same way the app does before reading process.env.
loadEnvConfig(process.cwd());

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error("Missing env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN");
  process.exit(1);
}

// Pass the Conversation SID (CHxxxxxxxx...) as the first CLI argument.
const conversationSid = process.argv[2];

if (!conversationSid) {
  console.error("Usage: tsx scripts/delete-twilio-conversation.ts <CONVERSATION_SID>");
  process.exit(1);
}

if (!conversationSid.startsWith("CH")) {
  console.error(`"${conversationSid}" does not look like a Conversation SID (expected a CH... value).`);
  process.exit(1);
}

const client = twilio(accountSid, authToken);

// Deletes from the default Conversations Service (the same one the app and the
// verification spike use). This is destructive and cannot be undone.
async function main() {
  console.log(`Deleting Twilio conversation ${conversationSid}...`);
  await client.conversations.v1.conversations(conversationSid).remove();
  console.log("Deleted. The participant set is now free to reuse for a new group.");
}

main().catch((error) => {
  console.error("Delete failed:", error);
  process.exit(1);
});
