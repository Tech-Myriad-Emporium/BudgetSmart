import { env } from "./env.js";
import { createServer } from "./server.js";
import { startDigestScheduler } from "./features/summary/summary.js";

const app = createServer();
startDigestScheduler();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\x1b[32m▸ BudgetSmart API\x1b[0m listening on http://localhost:${env.port}  (${env.nodeEnv})`);
});
