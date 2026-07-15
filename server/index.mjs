import { createPortalServer, loadConfig } from "./portal-server.mjs";

const config = loadConfig();
const server = createPortalServer({ config });
server.listen(config.port, "0.0.0.0", () => {
  console.log(`Command portal listening on port ${config.port} in ${config.mode} mode.`);
});
