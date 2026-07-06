import { PrismaClient } from "@prisma/client";

// Optional escape hatch: when DATABASE_OVERRIDE_URL is set, the client
// connects to that URL instead of the schema's DATABASE_URL/DIRECT_URL pair.
// Useful for pointing the API at a local or throwaway database.
const overrideUrl = process.env.DATABASE_OVERRIDE_URL;

export const prisma = overrideUrl
  ? new PrismaClient({ datasourceUrl: overrideUrl })
  : new PrismaClient();
