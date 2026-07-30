import { createPortalServer, loadConfig } from "./portal-server.mjs";
import { createReplitAuthIdentityVerifier } from "./replit-auth-provider.mjs";

const config = loadConfig();
const server = createPortalServer({
  config,
  // Managed-ingress verification remains authoritative in Replit deployments.
  // Outside deployments, createPortalServer falls back to the interactive
  // Replit Auth (OIDC) provider-session verifier when it is enabled.
  providerIdentityVerifier: config.executiveSessionEnabled && config.replitDeployment
    ? createReplitAuthIdentityVerifier(config)
    : undefined,
});
server.listen(config.port, "0.0.0.0", () => {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "experience_gateway_startup",
    port: config.port,
    runtimeUrl: config.runtimePublicUrl,
    hostedObservationReadOnly: true,
    hostedOperationalGatewayEnabled: config.operationalEnabled,
    hostedOperationalMode: config.operationalEnabled ? "single_workspace_alpha" : "disabled",
    localCapabilitiesEnabled: config.localCapabilitiesEnabled,
    localApiTarget: config.localCapabilitiesEnabled ? new URL(config.localApiBaseUrl).origin : null
  }));
});

function shutdown(signal) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event: "experience_gateway_shutdown", signal }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
