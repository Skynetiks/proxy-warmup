import fs from "fs";
import pg from "pg";
import { env } from "../env.js";

const sqlQuery = `SELECT email FROM "Lead" WHERE "isEmailValid" = 'VALID'`;

const main = async () => {
  // Set up the database client using the connection string from the environment.
  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
  });

  try {
    // Connect to the database.
    await client.connect();

    // Execute the SQL query.
    const res = await client.query(sqlQuery);
    const leads = res.rows as { email: string }[];

    const emails = leads.map((lead) => lead.email);
    console.log(`Fetched ${emails.length} leads from the database.`);

    // Write the fetched leads to a JSON file.
    fs.writeFileSync(env.RECIPIENTS_FILE, JSON.stringify(emails, null, 2), "utf8");
    console.log("Leads saved successfully in leads.json");
  } catch (error) {
    console.error("Error fetching leads:", error);
  } finally {
    // Ensure the client is closed whether or not the query succeeds.
    await client.end();
  }
};

main();
