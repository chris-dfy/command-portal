// Mission 3 provider-native Replit Auth identity verification.
//
// The Replit "Users & Auth" platform integration terminates human
// authentication at the Replit-managed ingress: after a person signs in with
// Replit Auth, the platform edge injects verified identity headers into the
// request it forwards to this Gateway and strips any client-supplied values
// for those headers. That platform verification — not any browser-controlled
// raw `x-replit-auth-token` header — is the server-side source of the stable
// provider subject consumed here.
//
// Boundaries enforced by this module:
// - Fail closed unless the Gateway is running behind the Replit-managed
//   ingress (`REPLIT_DEPLOYMENT`) and the request arrived on a bound
//   `REPLIT_DOMAINS` host, so spoofed headers on unmanaged ingress are never
//   trusted.
// - The Experience Gateway service principal is never accepted as a human.
// - The raw provider subject is returned only to the executive-session
//   adapter, which immediately reduces it to an opaque sha256 binding; this
//   module never retains or logs subject data.
// - No Authority is derived here: `authorityGranted=false` and
//   `actionAuthorized=false` semantics of the Mission 3 contract are
//   untouched — this module only resolves identity.

const PROVIDER = "replit-auth";
const VERIFIED_SUBJECT_HEADER = "x-replit-user-id";
const VERIFIED_NAME_HEADER = "x-replit-user-name";
const SUBJECT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,191}$/;

class ReplitAuthProviderFailure extends Error {
  constructor(message) {
    super(message);
    this.name = "ReplitAuthProviderFailure";
  }
}

const headerValue = (request, name) => {
  const value = request?.headers?.[name];
  if (Array.isArray(value)) return null;
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
};

const requestHost = (request) => {
  const forwarded = headerValue(request, "x-forwarded-host");
  const host = (forwarded ?? headerValue(request, "host") ?? "").split(",")[0].trim();
  return host.split(":")[0].toLowerCase();
};

export function createReplitAuthIdentityVerifier(config, { clock = () => Date.now() } = {}) {
  if (!config || typeof config !== "object") {
    throw new Error("Replit Auth identity verification requires the Gateway configuration.");
  }
  const serviceSubjects = new Set(
    [
      config.humanSessionServiceBindingId,
      config.operationalUserId,
      config.contextAssertionIssuer,
    ].filter((value) => typeof value === "string" && value.length > 0),
  );
  const boundHosts = new Set(
    (Array.isArray(config.replitDomains) ? config.replitDomains : [])
      .map((domain) => String(domain).trim().toLowerCase())
      .filter(Boolean),
  );
  return async (request) => {
    if (config.replitDeployment !== true || boundHosts.size === 0) {
      throw new ReplitAuthProviderFailure(
        "Replit Auth identity is only trusted behind the Replit-managed ingress.",
      );
    }
    const host = requestHost(request);
    if (!host || !boundHosts.has(host)) {
      throw new ReplitAuthProviderFailure(
        "The request did not arrive on a bound Replit Auth ingress host.",
      );
    }
    const subject = headerValue(request, VERIFIED_SUBJECT_HEADER);
    const username = headerValue(request, VERIFIED_NAME_HEADER);
    if (!subject || !username || !SUBJECT_PATTERN.test(subject)) {
      throw new ReplitAuthProviderFailure(
        "Replit Auth did not present a platform-verified human identity.",
      );
    }
    if (serviceSubjects.has(subject) || serviceSubjects.has(username)) {
      throw new ReplitAuthProviderFailure(
        "The Experience Gateway service principal is never a human identity.",
      );
    }
    return Object.freeze({
      provider: PROVIDER,
      issuer: config.replitAuthIssuer,
      audience: config.replitAuthAudience,
      subject,
      authnTime: Math.floor(clock() / 1000),
      authnMethods: Object.freeze([PROVIDER]),
    });
  };
}
