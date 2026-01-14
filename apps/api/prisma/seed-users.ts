
import { PrismaClient, UserStatus, Gender } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST_NAMES = ['赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨', '张', '刘', '朱', '秦', '尤', '许', '何', '吕', '施'];
const LAST_NAMES = ['伟', '芳', '娜', '秀英', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀兰', '霞', '平', '刚', '桂英'];

function getRandomElement<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function generateRandomName(): string {
    const firstName = getRandomElement(FIRST_NAMES);
    const lastName = getRandomElement(LAST_NAMES) + (Math.random() > 0.5 ? getRandomElement(LAST_NAMES) : '');
    return firstName + lastName;
}

function generateRandomPhone(): string {
    // Simple generator for 11 digit phone number starting with 1
    return '1' + Math.floor(Math.random() * 9 + 1) + Math.random().toString().slice(2, 11);
}

// Generate base36 string for uniqueness
const randomString = () => Math.random().toString(36).substring(7);

async function main() {
    console.log('Start seeding users...');

    // Get existing organizations and departments
    let orgs = await prisma.organization.findMany();
    let depts = await prisma.department.findMany();

    if (orgs.length === 0) {
        console.log('No organizations found. Creating a default HQ...');
        const org = await prisma.organization.create({
            data: {
                name: 'Headquarters',
                code: 'HQ_' + randomString(),
                type: 'HEADQUARTERS'
            }
        });
        orgs = [org];
    }

    const usersData = [];
    const count = 50; // Generate 50 users

    for (let i = 0; i < count; i++) {
        const name = generateRandomName();
        const org = getRandomElement(orgs);

        // Find departments belonging to this organization
        const orgDepts = depts.filter(d => d.organizationId === org.id);
        const dept = orgDepts.length > 0 ? getRandomElement(orgDepts) : undefined;

        // Random suffix to ensure uniqueness for username/email
        const suffix = randomString();

        usersData.push({
            username: `user_${suffix}_${i}`,
            email: `user_${suffix}_${i}@example.com`,
            name: name,
            gender: Math.random() > 0.5 ? Gender.MALE : Gender.FEMALE,
            employeeNo: `EMP${Date.now()}${i}`,
            phone: generateRandomPhone(),
            organizationId: org.id,
            departmentId: dept?.id,
            status: UserStatus.ACTIVE,
            position: Math.random() > 0.8 ? 'Manager' : 'Staff',
            hireDate: new Date(),
        });
    }

    console.log(`Prepared ${usersData.length} users. Inserting...`);

    for (const u of usersData) {
        try {
            await prisma.user.create({ data: u });
        } catch (e) {
            console.error(`Failed to insert user ${u.name}:`, e);
        }
    }

    console.log(`Seeding completed.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
