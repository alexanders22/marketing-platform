-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "domains" TEXT[],
    "secretEnc" TEXT NOT NULL,
    "consentRequired" BOOLEAN NOT NULL DEFAULT false,
    "autoForms" BOOLEAN NOT NULL DEFAULT true,
    "capi" BOOLEAN NOT NULL DEFAULT false,
    "pixelId" TEXT,
    "capiTokenEnc" TEXT,
    "capiError" TEXT,
    "capiEvents" TEXT[] DEFAULT ARRAY['Lead', 'Purchase', 'CompleteRegistration', 'Schedule']::TEXT[],
    "pixelMirror" BOOLEAN NOT NULL DEFAULT false,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visitor" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "cookieId" TEXT NOT NULL,
    "userId" TEXT,
    "emailHash" TEXT,
    "phoneHash" TEXT,
    "contact" TEXT,
    "name" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "sid" TEXT NOT NULL,
    "landingUrl" TEXT NOT NULL,
    "referrer" TEXT,
    "source" TEXT,
    "medium" TEXT,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "clickKind" TEXT,
    "clickId" TEXT,
    "fbc" TEXT,
    "fbp" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "country" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 0,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagEvent" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitId" TEXT,
    "visitorId" TEXT,
    "name" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "url" TEXT,
    "title" TEXT,
    "value" DOUBLE PRECISION,
    "currency" TEXT,
    "props" JSONB,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "capi" TEXT,
    "capiError" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TagEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatBot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL DEFAULT 'Assistant',
    "greeting" TEXT NOT NULL DEFAULT 'Hi! How can I help you?',
    "instructions" TEXT NOT NULL DEFAULT '',
    "knowledge" TEXT NOT NULL DEFAULT '',
    "languages" TEXT[],
    "redFlags" TEXT[],
    "color" TEXT NOT NULL DEFAULT '#4f46e5',
    "position" TEXT NOT NULL DEFAULT 'right',
    "notifyEmails" TEXT[],
    "telegramChatId" TEXT,
    "telegramName" TEXT,
    "actionsUrl" TEXT,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitorId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BOT',
    "userId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "pageUrl" TEXT,
    "handoffReason" TEXT,
    "handoffAt" TIMESTAMP(3),
    "chargedAt" TIMESTAMP(3),
    "botReplies" INTEGER NOT NULL DEFAULT 0,
    "unread" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastText" TEXT,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "tools" JSONB,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Site_workspaceId_key" ON "Site"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_key_key" ON "Site"("key");

-- CreateIndex
CREATE INDEX "Visitor_siteId_lastSeenAt_idx" ON "Visitor"("siteId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "Visitor_siteId_userId_idx" ON "Visitor"("siteId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Visitor_siteId_cookieId_key" ON "Visitor"("siteId", "cookieId");

-- CreateIndex
CREATE INDEX "Visit_siteId_startedAt_idx" ON "Visit"("siteId", "startedAt");

-- CreateIndex
CREATE INDEX "Visit_visitorId_startedAt_idx" ON "Visit"("visitorId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_siteId_sid_key" ON "Visit"("siteId", "sid");

-- CreateIndex
CREATE INDEX "TagEvent_siteId_createdAt_idx" ON "TagEvent"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "TagEvent_siteId_name_createdAt_idx" ON "TagEvent"("siteId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "TagEvent_visitorId_createdAt_idx" ON "TagEvent"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "TagEvent_capi_createdAt_idx" ON "TagEvent"("capi", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TagEvent_siteId_eventId_key" ON "TagEvent"("siteId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatBot_workspaceId_key" ON "ChatBot"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatConversation_workspaceId_lastMessageAt_idx" ON "ChatConversation"("workspaceId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "ChatMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visitor" ADD CONSTRAINT "Visitor_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagEvent" ADD CONSTRAINT "TagEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagEvent" ADD CONSTRAINT "TagEvent_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TagEvent" ADD CONSTRAINT "TagEvent_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatBot" ADD CONSTRAINT "ChatBot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_visitorId_fkey" FOREIGN KEY ("visitorId") REFERENCES "Visitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
