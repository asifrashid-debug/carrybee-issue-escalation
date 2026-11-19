import handler, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from "./.open-next/worker.js";

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache };

export default {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    if (!env.CRON_SECRET) {
      console.error("[cron] CRON_SECRET is not configured; skipping daily-report");
      return;
    }
    const req = new Request("https://internal/api/cron/daily-report", {
      method: "GET",
      headers: {
        authorization: `Bearer ${env.CRON_SECRET}`,
        "x-cloudflare-cron": event.cron || "0 14 * * *",
      },
    });
    ctx.waitUntil(
      handler.fetch(req, env, ctx).then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`[cron] daily-report failed (${res.status}): ${text}`);
        }
      })
    );
  },
};
