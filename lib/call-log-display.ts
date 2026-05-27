export function formatCallDuration(seconds: number | null): string | null {
  if (seconds == null || seconds < 0) {
    return null;
  }

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatCallStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function formatCallThreadSummary(input: {
  status: string;
  durationSeconds: number | null;
}): string {
  const duration = formatCallDuration(input.durationSeconds);
  if (duration) {
    return duration;
  }

  if (input.status === "completed") {
    return "0:00";
  }

  return formatCallStatusLabel(input.status);
}
