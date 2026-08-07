import { z } from "zod";
import { isCommStackUserId } from "@/lib/commstack-ids";
import { isValidPhoneNumber } from "@/lib/phone";

const optionalPhone = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine((value) => !value || isValidPhoneNumber(value), "Invalid phone number.");

const optionalNotifyClientId = z
  .string()
  .trim()
  .min(1, "Notify client ID is required.")
  .max(120)
  .optional()
  .nullable()
  .refine(
    (value) => !value || isCommStackUserId(value),
    "Notify client ID must be a valid UUID.",
  );

const optionalCommStackString = z.string().trim().min(1).max(240).optional().nullable();

const optionalCommStackPortalUserId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(
    (value) => !value || isCommStackUserId(value),
    "CommStack portal user ID must be a valid UUID.",
  );

const optionalCommStackAppId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .refine(
    (value) => !value || isCommStackUserId(value),
    "CommStack app ID must be a valid UUID.",
  );

const contactCommStackShape = {
  commStackAppId: optionalCommStackAppId,
  commStackAppName: optionalCommStackString,
  commStackBaseUrl: optionalCommStackString,
  commStackPortalUserId: optionalCommStackPortalUserId,
};

type ContactCommStackInput = {
  phone?: string | null;
  notifyClientId?: string | null;
  name?: string | null;
  commStackAppId?: string | null;
  commStackAppName?: string | null;
  commStackBaseUrl?: string | null;
  commStackPortalUserId?: string | null;
};

function refinePhoneXorNotifyClientId(
  data: { phone?: string | null; notifyClientId?: string | null },
  ctx: z.RefinementCtx,
) {
  const hasPhone = Boolean(data.phone?.trim());
  const hasNotify = Boolean(data.notifyClientId?.trim());
  if (hasPhone === hasNotify) {
    ctx.addIssue({
      code: "custom",
      path: hasPhone ? ["notifyClientId"] : ["phone"],
      message: "Provide either a phone number or a Notify client ID, not both.",
    });
  }
}

const COMM_STACK_FIELD_LABELS = {
  commStackAppId: "COMM_STACK_APP_ID",
  commStackAppName: "COMM_STACK_APP_NAME",
  commStackBaseUrl: "COMM_STACK_BASE_URL",
  commStackPortalUserId: "COMM_STACK_PORTAL_USER_ID",
} as const;

/** Require CommStack fields + name for Notify; forbid them on SMS. */
function refineNotifyCommStackConfig(data: ContactCommStackInput, ctx: z.RefinementCtx) {
  const hasPhone = Boolean(data.phone?.trim());
  const hasNotify = Boolean(data.notifyClientId?.trim());
  const fields = Object.keys(COMM_STACK_FIELD_LABELS) as Array<keyof typeof COMM_STACK_FIELD_LABELS>;

  if (hasPhone) {
    for (const field of fields) {
      if (data[field]?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "CommStack settings are only allowed for Notify contacts.",
        });
      }
    }
    return;
  }

  if (!hasNotify) return;

  if (!data.name?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["name"],
      message: "Name is required for Notify contacts.",
    });
  }

  for (const field of fields) {
    if (!data[field]?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: `${COMM_STACK_FIELD_LABELS[field]} is required for Notify contacts.`,
      });
    }
  }
}

export const sendMessageSchema = z
  .object({
    conversationId: z.string().uuid().optional(),
    phone: z
      .string()
      .min(8)
      .refine((value) => isValidPhoneNumber(value), "Invalid phone number.")
      .optional(),
    notifyClientId: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine((value) => isCommStackUserId(value), "Notify client ID must be a valid UUID.")
      .optional(),
    body: z.string().trim().min(1, "Message cannot be empty.").max(1600, "Message is too long."),
    contactName: z.string().trim().min(1).max(120).optional(),
    facility: z.string().trim().min(1).max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.conversationId && !data.phone && !data.notifyClientId) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Provide a conversation, phone number, or Notify client ID.",
      });
    }
  });

export const createConversationSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional().nullable(),
    phone: optionalPhone,
    notifyClientId: optionalNotifyClientId,
    facility: z.string().trim().max(120).optional().nullable(),
    address: z.string().trim().max(240).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    emergencyContactName: z.string().trim().max(120).optional().nullable(),
    emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
    ...contactCommStackShape,
  })
  .superRefine((data, ctx) => {
    refinePhoneXorNotifyClientId(data, ctx);
    refineNotifyCommStackConfig(data, ctx);
  });

export const createContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional().nullable(),
    phone: optionalPhone,
    notifyClientId: optionalNotifyClientId,
    facility: z.string().trim().max(120).optional().nullable(),
    address: z.string().trim().max(240).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    emergencyContactName: z.string().trim().max(120).optional().nullable(),
    emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
    ...contactCommStackShape,
  })
  .superRefine((data, ctx) => {
    refinePhoneXorNotifyClientId(data, ctx);
    refineNotifyCommStackConfig(data, ctx);
  });

export const updateContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional().nullable(),
    phone: optionalPhone,
    notifyClientId: optionalNotifyClientId,
    facility: z.string().trim().max(120).optional().nullable(),
    address: z.string().trim().max(240).optional().nullable(),
    notes: z.string().trim().max(2000).optional().nullable(),
    emergencyContactName: z.string().trim().max(120).optional().nullable(),
    emergencyContactPhone: z.string().trim().max(30).optional().nullable(),
    ...contactCommStackShape,
  })
  .superRefine((data, ctx) => {
    const phoneProvided = Object.prototype.hasOwnProperty.call(data, "phone");
    const notifyProvided = Object.prototype.hasOwnProperty.call(data, "notifyClientId");
    if (phoneProvided && notifyProvided) {
      refinePhoneXorNotifyClientId(data, ctx);
    }
    // Full Notify CommStack validation runs server-side after merge with existing contact.
    if (data.notifyClientId?.trim()) {
      refineNotifyCommStackConfig(data, ctx);
    }
    if (data.phone?.trim()) {
      refineNotifyCommStackConfig(data, ctx);
    }
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

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .max(200, "Password is too long.");

export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(190),
  password: passwordField,
  role: z.enum(["admin", "nurse"]).default("nurse"),
  phoneNumber: z.string().trim().max(30).optional().nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: passwordField,
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address.").max(190),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Reset token is required."),
  newPassword: passwordField,
});

export const adminResetPasswordSchema = z.object({
  // Optional: when omitted, the API generates a random temporary password.
  password: passwordField.optional(),
});

export const updateUserSchema = z.object({
  disabled: z.boolean(),
});

export const initiateCallSchema = z.object({
  conversationId: z.string().uuid(),
  phone: z.string().min(8).refine((value) => isValidPhoneNumber(value), "Invalid phone number."),
});

export const updateCallLogSchema = z.object({
  status: z.enum(["canceled", "failed"]),
});

export const createGroupConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  contactIds: z
    .array(z.string().uuid())
    .min(2, "Select at least 2 contacts.")
    .max(9, "Groups support at most 9 external contacts."),
});

export const sendGroupMessageSchema = z.object({
  body: z.string().trim().min(1, "Message cannot be empty.").max(1600, "Message is too long."),
});
