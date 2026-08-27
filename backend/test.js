import prisma from "./config/prisma.js";

async function test() {
  try {
    const users = await prisma.users.findMany();

    console.log("Users:", users);
  } catch (error) {
    console.error("Prisma error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

test();