import { formatDistanceToNow, format } from "date-fns";

export function formatRelativeTime(dateValue: string | Date) {
  return formatDistanceToNow(new Date(dateValue), { addSuffix: true });
}

export function formatMessageTime(dateValue: string | Date) {
  return format(new Date(dateValue), "MMM d, yyyy h:mm a");
}
