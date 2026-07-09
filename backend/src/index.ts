import { env } from "./env.js";
import { createServer } from "./server.js";
import { startDigestScheduler } from "./features/summary/summary.js";
import { startMarketScheduler } from "./features/investments/priceSync.js";
import { startScheduleWorker } from "./features/schedule/schedule.js";
import { startMasterSync } from "./features/master/master.js";

const app = createServer();
startDigestScheduler();
startMarketScheduler();
startScheduleWorker();
startMasterSync();

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`\x1b[32m▸ BudgetSmart API\x1b[0m listening on http://localhost:${env.port}  (${env.nodeEnv})`);
});
