export async function register() {
  // Skip Edge runtime only. In some Next builds NEXT_RUNTIME is unset at boot.
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { isCommStackConfigured } = await import("@/lib/commstack");
  const { startCommStackRealtime } = await import("@/lib/commstack-realtime");

  if (!isCommStackConfigured()) {
    console.info("[commstack] instrumentation skipped — COMM_STACK_ENV not configured");
    return;
  }

  try {
    await startCommStackRealtime();
    console.info("[commstack] instrumentation realtime start complete");
  } catch (error) {
    // Do not crash the whole app if CommStack is misconfigured; messaging
    // routes / status will retry starting realtime on demand.
    console.error("[commstack] startup realtime failed", error);
  }
}
