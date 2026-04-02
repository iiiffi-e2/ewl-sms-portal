import { z } from "zod";
import { isValidPhoneNumber } from "@/lib/phone";

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  phone: z.string().min(8).refine((value) => isValidPhoneNumber(value), "Invalid phone number."),
  body: z.string().trim().min(1, "Message cannot be empty.").max(1600, "Message is too long."),
  contactName: z.string().trim().min(1).max(120).optional(),
  facility: z.string().trim().min(1).max(120).optional(),
});

export const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional().nullable(),
  phone: z.string().min(8).refine((value) => isValidPhoneNumber(value), "Invalid phone number."),
  facility: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  emergencyContactName: z.string().trim().max(120).optional().nullable(),
  emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
});

export const updateConversationSchema = z.object({
  status: z.enum(["new", "sms_sent", "awaiting_reply", "replied", "escalated", "closed"]).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export const createTemplateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(1600),
  category: z.string().trim().max(120).optional().nullable(),
  active: z.boolean().optional(),
});

export const createNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});
