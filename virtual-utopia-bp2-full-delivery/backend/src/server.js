import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { env } from './config/env.js';

app.listen(env.port, () => {
  console.log(
    `[backend] listening on http://localhost:${env.port} (${env.nodeEnv})`,
  );
});
