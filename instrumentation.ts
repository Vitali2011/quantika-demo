export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateDemoBoot } = await import("@/lib/demo-mode-validator");
    validateDemoBoot();
    await import("./sentry.server.config");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
