import bcrypt from "bcryptjs";
import { PrismaClient, ConversationStatus, MessageDirection, MessageStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { name: "CareText Admin", role: UserRole.admin, passwordHash },
    create: {
      name: "CareText Admin",
      email: "admin@example.com",
      passwordHash,
      role: UserRole.admin,
    },
  });

  const nurse = await prisma.user.upsert({
    where: { email: "nurse@example.com" },
    update: { name: "CareText Nurse", role: UserRole.nurse, passwordHash },
    create: {
      name: "CareText Nurse",
      email: "nurse@example.com",
      passwordHash,
      role: UserRole.nurse,
    },
  });

  await prisma.template.upsert({
    where: { id: "5b85789f-b987-42dd-9b89-78da25ccfdf5" },
    update: {
      title: "Check-in",
      body: "Hi, this is the nurse monitoring team checking in. Are you okay?",
      category: "Wellness",
      active: true,
    },
    create: {
      id: "5b85789f-b987-42dd-9b89-78da25ccfdf5",
      title: "Check-in",
      body: "Hi, this is the nurse monitoring team checking in. Are you okay?",
      category: "Wellness",
      active: true,
    },
  });

  await prisma.template.upsert({
    where: { id: "9476200d-2ea8-4fe2-a6fe-1f588d85df1a" },
    update: {
      title: "Need Assistance?",
      body: "We detected activity that may indicate you need assistance. Please reply YES if you need help.",
      category: "Alert",
      active: true,
    },
    create: {
      id: "9476200d-2ea8-4fe2-a6fe-1f588d85df1a",
      title: "Need Assistance?",
      body: "We detected activity that may indicate you need assistance. Please reply YES if you need help.",
      category: "Alert",
      active: true,
    },
  });

  await prisma.template.upsert({
    where: { id: "3aa5f666-f1c4-45b6-a47e-c5f6b4f96531" },
    update: {
      title: "Follow-up",
      body: "We attempted to reach you. Staff is being notified.",
      category: "Escalation",
      active: true,
    },
    create: {
      id: "3aa5f666-f1c4-45b6-a47e-c5f6b4f96531",
      title: "Follow-up",
      body: "We attempted to reach you. Staff is being notified.",
      category: "Escalation",
      active: true,
    },
  });

  const contactA = await prisma.contact.upsert({
    where: { phone: "+15551230001" },
    update: { name: "Martha Jones", facility: "Sunrise Senior Living" },
    create: {
      name: "Martha Jones",
      phone: "+15551230001",
      facility: "Sunrise Senior Living",
      notes: "Prefers evening follow-up.",
    },
  });

  const contactB = await prisma.contact.upsert({
    where: { phone: "+15551230002" },
    update: { name: "Robert Lee", facility: "Maple Grove Care Center" },
    create: {
      name: "Robert Lee",
      phone: "+15551230002",
      facility: "Maple Grove Care Center",
      notes: "Uses hearing aid, text slowly.",
    },
  });

  const conversationA = await prisma.conversation.upsert({
    where: { id: "21f1cc49-a2f7-4fae-a398-28f71cb85a2f" },
    update: { contactId: contactA.id, assignedToId: nurse.id, status: ConversationStatus.replied, lastMessageAt: new Date() },
    create: {
      id: "21f1cc49-a2f7-4fae-a398-28f71cb85a2f",
      contactId: contactA.id,
      assignedToId: nurse.id,
      status: ConversationStatus.replied,
      lastMessageAt: new Date(),
    },
  });

  const conversationB = await prisma.conversation.upsert({
    where: { id: "df8f68de-83fb-4f7f-ac11-f4a6cd9eed53" },
    update: { contactId: contactB.id, assignedToId: nurse.id, status: ConversationStatus.awaiting_reply, lastMessageAt: new Date(Date.now() - 1000 * 60 * 45) },
    create: {
      id: "df8f68de-83fb-4f7f-ac11-f4a6cd9eed53",
      contactId: contactB.id,
      assignedToId: nurse.id,
      status: ConversationStatus.awaiting_reply,
      lastMessageAt: new Date(Date.now() - 1000 * 60 * 45),
    },
  });

  await prisma.message.createMany({
    data: [
      {
        conversationId: conversationA.id,
        userId: nurse.id,
        body: "Hi Martha, this is your nurse monitoring team checking in.",
        direction: MessageDirection.outbound,
        status: MessageStatus.sent,
      },
      {
        conversationId: conversationA.id,
        body: "I am okay, thank you!",
        direction: MessageDirection.inbound,
        status: MessageStatus.received,
      },
      {
        conversationId: conversationB.id,
        userId: nurse.id,
        body: "We attempted to reach you. Please reply when available.",
        direction: MessageDirection.outbound,
        status: MessageStatus.delivered,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.internalNote.create({
    data: {
      conversationId: conversationA.id,
      userId: admin.id,
      body: "Family requested daily check-in before 5 PM.",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
