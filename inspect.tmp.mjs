// Leitura apenas.
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const rows = await prisma.$queryRawUnsafe(`
  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_schema IN ('public','precificaragao') AND table_type='BASE TABLE'
  ORDER BY table_schema, table_name
`);

let current = null;
for (const r of rows) {
  if (r.table_schema !== current) {
    current = r.table_schema;
    console.log(`\nschema ${current}:`);
  }
  const c = await prisma.$queryRawUnsafe(
    `SELECT count(*)::int AS n FROM "${r.table_schema}"."${r.table_name}"`,
  );
  console.log(`  ${r.table_name.padEnd(24)} ${String(c[0].n).padStart(5)} linhas`);
}
await prisma.$disconnect();
