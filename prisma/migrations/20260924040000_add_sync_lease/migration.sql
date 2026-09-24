-- CreateTable
CREATE TABLE "SyncLease" (
    "id" TEXT NOT NULL,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "ownerToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncLease_pkey" PRIMARY KEY ("id")
);
