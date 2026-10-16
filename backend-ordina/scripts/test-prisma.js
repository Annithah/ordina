require('dotenv/config');

const assert = require('node:assert/strict');
// Uses the same PostgreSQL client as the server (DATABASE_URL); cleans up after itself.
const prisma = require('../src/lib/prisma');

async function run() {
  const email = `prisma-${process.pid}@example.com`;
  const user = await prisma.user.create({
    data: { email, passwordHash: 'hash', displayName: 'Prisma Test' }
  });
  const category = await prisma.category.create({
    data: { userId: user.id, name: 'Work', color: '#2563eb' }
  });
  const task = await prisma.task.create({
    data: {
      userId: user.id,
      title: 'Verify Prisma CRUD',
      description: 'Exercise the PostgreSQL database through Prisma',
      priority: 2,
      categories: { create: { categoryId: category.id } }
    },
    include: { categories: { include: { category: true } } }
  });

  assert.equal(task.categories[0].category.name, 'Work');
  const updated = await prisma.task.update({
    where: { id: task.id },
    data: { status: 'completed', completedAt: new Date() }
  });
  assert.equal(updated.status, 'completed');

  await prisma.user.delete({ where: { id: user.id } });
  assert.equal(await prisma.task.count({ where: { id: task.id } }), 0);
  assert.equal(await prisma.category.count({ where: { id: category.id } }), 0);
  assert.equal(await prisma.taskCategory.count({ where: { taskId: task.id } }), 0);
  console.log('Prisma PostgreSQL connectivity and CRUD checks passed.');
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());