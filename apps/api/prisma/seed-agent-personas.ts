
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding Agent Personas...');

    const personas = [
        {
            personaCode: 'ANALYST',
            name: 'Market Analyst',
            description: 'Expert in analyzing market trends and interpreting data.',
            roleType: 'ANALYST',
            icon: 'BarChartOutlined',
            defaultConfig: {
                modelConfigKey: 'deepseek-chat',
                promptTemplate: {
                    systemPrompt: 'You are a senior market analyst. Your goal is to interpret data and provide actionable insights.',
                    userPromptTemplate: 'Analyze the following data: {{context}}',
                },
                tools: ['calculator', 'search_web'],
            },
        },
        {
            personaCode: 'RESEARCHER',
            name: 'Deep Researcher',
            description: 'Expert in finding and synthesizing information from multiple sources.',
            roleType: 'RESEARCHER',
            icon: 'SearchOutlined',
            defaultConfig: {
                modelConfigKey: 'deepseek-reasoner',
                promptTemplate: {
                    systemPrompt: 'You are a deep researcher. Search thoroughly and cite your sources.',
                    userPromptTemplate: 'Find information about: {{topic}}',
                },
                tools: ['search_web', 'knowledge_base'],
            },
        },
        {
            personaCode: 'WRITER',
            name: 'Creative Writer',
            description: 'Expert in generating engaging content and narratives.',
            roleType: 'WRITER',
            icon: 'EditOutlined',
            defaultConfig: {
                modelConfigKey: 'deepseek-chat',
                promptTemplate: {
                    systemPrompt: 'You are a creative writer. Write engaging and original content.',
                    userPromptTemplate: 'Write a story about: {{topic}}',
                },
                tools: [],
            },
        },
    ];

    for (const p of personas) {
        const persona = await prisma.agentPersona.upsert({
            where: { personaCode: p.personaCode },
            update: p,
            create: p,
        });
        console.log(`Upserted persona: ${persona.name} (${persona.id})`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
