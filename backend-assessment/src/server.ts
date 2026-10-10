import "dotenv/config";
import { app } from "./app";

const PORT = Number(process.env.Port) || 3010;

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Health check endpoint is available at http://localhost:${PORT}/health`);
  console.log(`Swagger docs are available at http://localhost:${PORT}/api-docs`);
});
