import { PrismaClient } from '@prisma/client';

/**
 * Em dev o Next.js recarrega os modulos a cada edicao; sem este cache global
 * cada reload abriria uma nova pool de ligacoes ate o Postgres recusar.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
