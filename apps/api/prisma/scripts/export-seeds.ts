/// <reference types="node" />

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting export...');

    // 1. Fetch Data
    const regions = await prisma.administrativeRegion.findMany({ orderBy: { level: 'asc' } });
    const organizations = await prisma.organization.findMany({ orderBy: { type: 'asc' } });
    const departments = await prisma.department.findMany();
    const roles = await prisma.role.findMany();
    const users = await prisma.user.findMany();
    const tagGroups = await prisma.tagGroup.findMany();
    const tags = await prisma.tag.findMany();
    const eventTypes = await prisma.eventTypeConfig.findMany();
    const insightTypes = await prisma.insightTypeConfig.findMany();
    const extractionRules = await prisma.extractionRule.findMany();
    const marketCategories = await prisma.marketCategory.findMany();
    const collectionPoints = await prisma.collectionPoint.findMany();

    // 2. Format Data helper
    const formatData = (data: any[]) => {
        if (!data || data.length === 0) return '[]';

        // Convert to JSON
        const json = JSON.stringify(data, null, 2);

        // Fix Dates: replace "2023-..." with new Date("2023-...")
        return json.replace(/"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)"/g, 'new Date("$1")');
    };

    // 3. Generate File Content using array join to avoid template literal hell
    const lines = [];
    lines.push("import { PrismaClient, Prisma } from '@prisma/client';");
    lines.push("");
    lines.push("const prisma = new PrismaClient();");
    lines.push("");
    lines.push("async function main() {");
    lines.push("  console.log('Seeding snapshot...');");
    lines.push("");

    // Administrative Regions
    lines.push("  // --- 1. Administrative Regions ---");
    lines.push(`  const regions = ${formatData(regions)};`);
    lines.push("  console.log(`Seeding ${regions.length} regions...`);");
    lines.push("  for (const item of regions) {");
    lines.push("    await prisma.administrativeRegion.upsert({");
    lines.push("      where: { code: item.code },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Organization
    lines.push("");
    lines.push("  // --- 2. Organization ---");
    lines.push(`  const organizations = ${formatData(organizations)};`);
    lines.push("  console.log(`Seeding ${organizations.length} organizations...`);");
    lines.push("  const sortedOrgs = organizations.sort((a: any, b: any) => {");
    lines.push("     if (!a.parentId && b.parentId) return -1;");
    lines.push("     if (a.parentId && !b.parentId) return 1;");
    lines.push("     return 0;");
    lines.push("  });");
    lines.push("  for (const item of sortedOrgs) {");
    lines.push("    try {");
    lines.push("        await prisma.organization.upsert({");
    lines.push("        where: { id: item.id },");
    lines.push("        update: item as any,");
    lines.push("        create: item as any,");
    lines.push("        });");
    lines.push("    } catch (e) {");
    lines.push("        console.warn('Skipping org ' + item.name);");
    lines.push("    }");
    lines.push("  }");

    // Departments
    lines.push("");
    lines.push("  // --- 3. Departments ---");
    lines.push(`  const departments = ${formatData(departments)};`);
    lines.push("  console.log(`Seeding ${departments.length} departments...`);");
    lines.push("  for (const item of departments) {");
    lines.push("      await prisma.department.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Roles
    lines.push("");
    lines.push("  // --- 4. Roles ---");
    lines.push(`  const roles = ${formatData(roles)};`);
    lines.push("  console.log(`Seeding ${roles.length} roles...`);");
    lines.push("  for (const item of roles) {");
    lines.push("      await prisma.role.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Users
    lines.push("");
    lines.push("  // --- 5. Users ---");
    lines.push(`  const users = ${formatData(users)};`);
    lines.push("  console.log(`Seeding ${users.length} users...`);");
    lines.push("  for (const item of users) {");
    lines.push("      await prisma.user.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Tag Groups
    lines.push("");
    lines.push("  // --- 6. Tag Groups ---");
    lines.push(`  const tagGroups = ${formatData(tagGroups)};`);
    lines.push("  console.log(`Seeding ${tagGroups.length} tagGroups...`);");
    lines.push("  for (const item of tagGroups) {");
    lines.push("      await prisma.tagGroup.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Tags
    lines.push("");
    lines.push("  // --- 7. Tags ---");
    lines.push(`  const tags = ${formatData(tags)};`);
    lines.push("  console.log(`Seeding ${tags.length} tags...`);");
    lines.push("  for (const item of tags) {");
    lines.push("      await prisma.tag.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Market Categories
    lines.push("");
    lines.push("  // --- 8. Market Categories ---");
    lines.push(`  const marketCategories = ${formatData(marketCategories)};`);
    lines.push("  for (const item of marketCategories) {");
    lines.push("      await prisma.marketCategory.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Event Types
    lines.push("");
    lines.push("  // --- 9. Event Types ---");
    lines.push(`  const eventTypes = ${formatData(eventTypes)};`);
    lines.push("  for (const item of eventTypes) {");
    lines.push("      await prisma.eventTypeConfig.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Insight Types
    lines.push("");
    lines.push("  // --- 10. Insight Types ---");
    lines.push(`  const insightTypes = ${formatData(insightTypes)};`);
    lines.push("  for (const item of insightTypes) {");
    lines.push("      await prisma.insightTypeConfig.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Extraction Rules
    lines.push("");
    lines.push("  // --- 11. Extraction Rules ---");
    lines.push(`  const extractionRules = ${formatData(extractionRules)};`);
    lines.push("  console.log(`Seeding ${extractionRules.length} extractionRules...`);");
    lines.push("  for (const item of extractionRules) {");
    lines.push("      await prisma.extractionRule.upsert({");
    lines.push("      where: { id: item.id },");
    lines.push("      update: item as any,");
    lines.push("      create: item as any,");
    lines.push("    });");
    lines.push("  }");

    // Collection Points
    lines.push("");
    lines.push("  // --- 12. Collection Points ---");
    lines.push(`  const collectionPoints = ${formatData(collectionPoints)};`);
    lines.push("  console.log(`Seeding ${collectionPoints.length} collectionPoints...`);");
    lines.push("  for (const item of collectionPoints) {");
    lines.push("    try {");
    lines.push("        await prisma.collectionPoint.upsert({");
    lines.push("        where: { id: item.id },");
    lines.push("        update: item as any,");
    lines.push("        create: item as any,");
    lines.push("        });");
    lines.push("    } catch(e) {");
    lines.push("        console.warn('Failed to seed CollectionPoint ' + item.name);");
    lines.push("    }");
    lines.push("  }");

    lines.push("");
    lines.push("  console.log('Seeding snapshot data completed.');");
    lines.push("}");
    lines.push("");
    lines.push("main()");
    lines.push("  .catch((e) => {");
    lines.push("    console.error(e);");
    lines.push("    process.exit(1);");
    lines.push("  })");
    lines.push("  .finally(async () => {");
    lines.push("    await prisma.$disconnect();");
    lines.push("  });");

    const content = lines.join('\n');
    const outputPath = path.join(__dirname, '../seed-snapshot.ts');
    fs.writeFileSync(outputPath, content);
    console.log(`Exported to ${outputPath}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
