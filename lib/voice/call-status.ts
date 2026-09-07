export type PatchCallLogStatus = "canceled" | "failed" | "completed";

export function mapPatchCallLogStatus(
  status: PatchCallLogStatus,
): PatchCallLogStatus {
  return status;
}

export function hangupCallLogPatchStatus(
  wasConnected: boolean,
): "canceled" | "completed" {
  return wasConnected ? "completed" : "canceled";
}
