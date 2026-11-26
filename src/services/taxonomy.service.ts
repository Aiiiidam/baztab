import type { Prisma } from '@prisma/client';
import { TAXONOMY_V0, TAXONOMY_VERSION } from '@/lib/data/taxonomy-v0';
import { prisma } from '@/lib/prisma';

/**
 * Tenant-scoped issue categories with stable IDs (tech spec §8, plan M3-T5).
 * Seeded when an organization is provisioned; the analysis pipeline maps the
 * model's category key to the organization's category ID. An unknown key maps
 * to null, which keeps the finding but makes it ineligible for the report.
 */

export type CategoryRef = { id: string; key: string; label: string };

/** Idempotent: inserts missing categories, refreshes labels and order of existing ones. */
export async function seedTaxonomy(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  for (const [index, category] of TAXONOMY_V0.entries()) {
    await tx.issueCategory.upsert({
      where: { organizationId_key: { organizationId, key: category.key } },
      create: {
        organizationId,
        key: category.key,
        label: category.label,
        taxonomyVersion: TAXONOMY_VERSION,
        sortOrder: index,
      },
      update: { label: category.label, sortOrder: index, taxonomyVersion: TAXONOMY_VERSION },
    });
  }
}

export async function listCategories(organizationId: string): Promise<CategoryRef[]> {
  return prisma.issueCategory.findMany({
    where: { organizationId, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: { id: true, key: true, label: true },
  });
}

/** The organization's categories, seeding them first if the organization predates the taxonomy. */
export async function ensureCategories(organizationId: string): Promise<CategoryRef[]> {
  const existing = await listCategories(organizationId);
  if (existing.length > 0) return existing;
  await prisma.$transaction((tx) => seedTaxonomy(tx, organizationId));
  return listCategories(organizationId);
}

export function mapCategory(categories: CategoryRef[], key: string | null): CategoryRef | null {
  if (!key) return null;
  return categories.find((category) => category.key === key) ?? null;
}

export { TAXONOMY_VERSION };
