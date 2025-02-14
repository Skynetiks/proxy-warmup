import { z } from "zod";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Define the schema for environment variables
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  RECOMMENDED: z.string().default("true").transform(b => b === "true"),
  SMTP_PASS: z.string().nonempty("SMTP_PASS is required."),
  SMTP_USER: z.string().nonempty("SMTP_USER is required."),
  SMTP_PORT: z.coerce.number(),
  SMTP_HOST: z.string().nonempty("SMTP_HOST is required."),
  SMTP_PROXY: z.string().url().nonempty("SMTP_PROXY is required.").optional(),
  RECIPIENTS_FILE: z.string().nonempty("RECIPIENTS_FILE is required."),
  DATABASE_URL: z.string().nonempty("DATABASE_URL is required."),
});


/**
 * Create and validate environment configuration.
 * @param {z.ZodSchema} schema - The schema for environment variables.
 * @returns {object} - The parsed and validated environment variables.
 */
const createEnv = <T extends z.AnyZodObject>(schema: T) => {
  try {
    return schema.parse(process.env) as z.infer<T>;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Environment variable validation failed:");
      console.error("============================= ERRORS ==============================");
      error.errors.forEach((err, index) => console.error(`${index + 1}: ${err.path.join(".")} ${err.message}`));
      console.error("====================================================================");
      process.exit(1); // Exit with failure if validation fails
    }
    throw error;
  }
};


export const env = createEnv(envSchema);
