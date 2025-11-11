// src/index.ts
import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();
app.listen(env.PORT, () => {
  console.log(`✅ Server listening on http://0.0.0.0:${env.PORT}`);
});
