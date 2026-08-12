export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const { isCommStackConfigured, isCommStackRealtimeEnabled } = await import("@/lib/commstack");

  if (!isCommStackConfigured()) {
    console.info("[commstack] instrumentation skipped — COMM_STACK_ENV not configured");
    return;
  }

  if (!isCommStackRealtimeEnabled()) {
    console.info(
      "[commstack] instrumentation skipped — realtime disabled (VERCEL default or COMM_STACK_REALTIME=0)",
    );
    return;
  }

  const { startCommStackRealtime } = await import("@/lib/commstack-realtime");

  try {
    await startCommStackRealtime();
    console.info("[commstack] instrumentation realtime start complete");
  } catch (error) {
    console.error("[commstack] startup realtime failed", error);
  }
}
