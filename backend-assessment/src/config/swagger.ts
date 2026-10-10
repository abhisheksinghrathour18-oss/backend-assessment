
import swaggerJSDoc from "swagger-jsdoc";

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Backend Assessment API",
      version: "1.0.0",
      description:
        "Order ingestion API with CSV validation, PostgreSQL sharding, and batch processing.",
    },
    servers: [
      {
        url: "http://localhost:3010",
        description: "Local development",
      },
    ],
  },
  apis: ["src/app.ts", "src/modules/orders/*.ts"],
};

export const swaggerSpec = swaggerJSDoc(options);
