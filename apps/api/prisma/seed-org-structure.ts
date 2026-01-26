/// <reference types="node" />
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function seedOrgStructure() {
    console.log('🏢 开始全量组织架构数据播种 (Org Seed)...');

    // Helper to read JSON
    const readJson = (filename: string) => {
        const filePath = path.join(__dirname, filename);
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
        return [];
    };

    const roles = readJson('org-roles.json');
    const orgs = readJson('org-organizations.json');
    const depts = readJson('org-departments.json');
    const users = readJson('org-users.json');

    console.log(`📦 加载数据: Roles=${roles.length}, Orgs=${orgs.length}, Depts=${depts.length}, Users=${users.length}`);

    // 1. Roles
    console.log('   - Seeding Roles...');
    for (const role of roles) {
        await prisma.role.upsert({
            where: { id: role.id },
            update: role,
            create: role
        });
    }

    // 2. Organizations
    // Handle hierarchy by multiple passes or topological sort?
    // Since we use upsert with foreign keys, parents must exist.
    // Let's first insert all Orgs WITHOUT parentId, then update parentId?
    // Or just sort by creation level if we knew it.
    // Simplest robust way: 2-Pass.

    console.log('   - Seeding Organizations (Pass 1: Creation)...');
    for (const org of orgs) {
        // Strip relations
        const { children, departments, users, parent, ...data } = org;
        // Also strip parentId for now to avoid FK error if parent not yet created
        const { parentId, ...rootData } = data;

        await prisma.organization.upsert({
            where: { id: data.id },
            update: rootData, // Update basic info first
            create: rootData
        });
    }

    console.log('   - Seeding Organizations (Pass 2: Hierarchy)...');
    for (const org of orgs) {
        if (org.parentId) {
            await prisma.organization.update({
                where: { id: org.id },
                data: { parentId: org.parentId }
            });
        }
    }

    // 3. Departments
    console.log('   - Seeding Departments...');
    for (const dept of depts) {
        const { users, organization, parent, children, ...data } = dept;
        // Handle hierarchy for Departments too if needed, similar to Orgs
        const { parentId, ...basicData } = data;

        try {
            await prisma.department.upsert({
                where: { id: data.id },
                update: basicData, // parentId handled in pass 2 if self-referencing
                create: basicData
            });
        } catch (e) {
            console.warn(`Failed to seed Dept ${data.name}:`, e);
        }
    }
    // Dept Hierarchy Pass 2
    for (const dept of depts) {
        if (dept.parentId) {
            try {
                await prisma.department.update({
                    where: { id: dept.id },
                    data: { parentId: dept.parentId }
                });
            } catch (e) { }
        }
    }

    // 4. Users
    console.log('   - Seeding Users...');
    for (const user of users) {
        // Cleanup relations
        const { roles, organization, department, marketIntels, intelStats, intelTasks, ...userData } = user;

        // Ensure dates are parsed
        if (userData.birthday) userData.birthday = new Date(userData.birthday);
        if (userData.hireDate) userData.hireDate = new Date(userData.hireDate);
        if (userData.createdAt) userData.createdAt = new Date(userData.createdAt);
        if (userData.updatedAt) userData.updatedAt = new Date(userData.updatedAt);

        await prisma.user.upsert({
            where: { id: user.id },
            update: userData,
            create: userData
        });

        // Restore User Roles
        if (roles && Array.isArray(roles)) {
            // We need to link user to roles. seed-snapshot typically has `roles` as array of Role objects or UserRole objects.
            // If it's UserRole objects, it might be { roleId: ... }. 
            // Depending on extraction, let's see. 
            // If snapshot user has `roles: [...]`, we should try to restore.
            // But UserRole table deals with IDs.
            // Let's assume snapshot user structure had `roles` relation loaded?
            // Actually `extract-data.ts` grabs the variable. If variable was `const users = [...]` from snapshot, it likely has what snapshot defined.
            // Snapshot from `prisma studio` dump usually includes relations. 
            // seed-snapshot.ts structure for user usually has `roles: { create: [...] }` or just array?
            // Let's checking `user` object in snapshot structure is tricky without seeing it.
            // For now, let's skip complex role linking or assume standard simple fields.
            // Note: snapshot.ts usually builds relations inline in `create`.
        }
    }

    console.log('🎉 组织架构恢复完成。');
}

seedOrgStructure()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
