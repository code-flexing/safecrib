import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = `payflow_test_${Date.now()}@example.com`;
  const password = 'Test1234!';

  // Create a student user with approved student profile
  const passwordHash = await argon2.hash(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: 'Pay Flow Test',
      role: 'STUDENT',
      emailVerified: true,
      identityVerified: true,
      studentProfile: {
        create: {
          displayName: 'Pay Flow Test',
          shortBio: 'test',
          proofOfStudentship: 'test-proof',
          schoolOfStudy: 'Test University',
          courseOfStudy: 'Computer Science',
          level: '300',
          profilePicture: 'test-avatar',
          status: 'APPROVED',
          submittedAt: new Date(),
          reviewedAt: new Date(),
        },
      },
      verification: {
        create: {
          stage: 'PROFILE_VERIFIED',
          badge: 'GREEN_CHECK',
          studentProfileApproved: true,
        },
      },
    },
  });

  // Create a provider/landlord listing
  const owner = await prisma.user.create({
    data: {
      email: `provider_${Date.now()}@example.com`,
      passwordHash: await argon2.hash(password),
      displayName: 'Test Provider',
      role: 'LANDLORD',
      emailVerified: true,
      identityVerified: true,
      providerPage: {
        create: {
          displayName: 'Test Provider',
          shortBio: 'test',
          verificationState: 'VERIFIED',
          businessRegNumber: `REG-${Date.now()}`,
          businessName: 'Test Properties',
        },
      },
      verification: {
        create: {
          stage: 'AGENT_VERIFIED',
          badge: 'BLUE_SHIELD',
          providerVerified: true,
        },
      },
    },
  });

  const listing = await prisma.listing.create({
    data: {
      ownerId: owner.id,
      title: 'Test Secure Room',
      description: 'A test listing for payment flow',
      price: 50000,
      lat: 6.5244,
      lng: 3.3792,
      campus: 'Unilag',
      address: 'Test Address',
      status: 'VERIFIED',
      availability: 'AVAILABLE',
    },
  });

  console.log(JSON.stringify({
    event: 'test_data_created',
    studentId: user.id,
    providerId: owner.id,
    listingId: listing.id,
    email,
    password,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());