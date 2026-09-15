apps/web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   │
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   │
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── projects/
│   │   │   └── page.tsx
│   │   │
│   │   └── projects/[projectId]/
│   │       ├── layout.tsx
│   │       ├── page.tsx
│   │       │
│   │       ├── tasks/
│   │       │   ├── page.tsx
│   │       │   └── [taskId]/
│   │       │       └── page.tsx
│   │       │
│   │       ├── memory/
│   │       │   ├── decisions/page.tsx
│   │       │   ├── architecture/page.tsx
│   │       │   └── issues/page.tsx
│   │       │
│   │       ├── analytics/
│   │       │   └── page.tsx
│   │       │
│   │       └── timeline/
│   │           └── page.tsx
│   │
│   └── api/
│       └── auth/
│           └── [...nextauth]/route.ts
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── ProjectSwitcher.tsx
│   ├── tasks/
│   │   ├── TaskList.tsx
│   │   ├── TaskStatusBadge.tsx
│   │   └── TaskRunHistory.tsx
│   ├── memory/
│   │   ├── DecisionForm.tsx
│   │   ├── ArchitectureNoteCard.tsx
│   │   └── KnownIssueList.tsx
│   ├── analytics/
│   │   └── AgentComparisonTable.tsx
│   ├── timeline/
│   │   └── TimelineFeed.tsx
│   └── ui/
│
├── lib/
│   ├── api-client.ts
│   ├── auth.ts
│   └── query-client.ts
│
├── hooks/
│   ├── useProject.ts
│   ├── useTasks.ts
│   └── useAnalytics.ts
│
├── middleware.ts
├── next.config.js
└── .env.example