import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db/index.js";

const app = await buildApp();

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  await app.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`Doxin API ready at http://localhost:${config.PORT} (docs: /docs)`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
