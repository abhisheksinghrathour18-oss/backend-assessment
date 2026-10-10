import { env } from "./config/env";
import { app } from "./app";

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Health check endpoint is available at http://localhost:${PORT}/health`);
  console.log(`Swagger docs are available at http://localhost:${PORT}/api-docs`);
});
