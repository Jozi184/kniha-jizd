import { handleRidePlaces } from "../lib/ride-places";
import { handleMapTile } from "../lib/map-tiles";
import { handleRideLog } from "../lib/ride-log";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

export default {
  fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    if (new URL(request.url).pathname === "/api/ride-places") return handleRidePlaces(request, (env as Cloudflare.Env & {MAPY_API_KEY?:string}).MAPY_API_KEY);
    if (new URL(request.url).pathname === "/api/map-tiles") return handleMapTile(request, (env as Cloudflare.Env & {MAPY_API_KEY?:string}).MAPY_API_KEY);
    if (new URL(request.url).pathname === "/api/log") return handleRideLog(request, env.DB);
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    return runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx));
  },
};
