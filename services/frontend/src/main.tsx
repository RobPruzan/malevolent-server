import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { edenTreaty } from "@elysiajs/eden";
import { z } from "zod";
import type { App } from "@fireside/backend";

import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { ThemeProvider } from "./hooks/useTheme";

import { routeTree } from "./routes";
import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const envSchema = z.object(
  {
    VITE_API_URL: z.string(),
  },
  {
    errorMap: (error) => ({
      message: `Missing environment variable ${error.path.join(".")}`,
    }),
  }
);

envSchema.parse({
  VITE_API_URL: import.meta.env.VITE_API_URL,
});

declare global {
  interface ImportMetaEnv extends z.infer<typeof envSchema> {}
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
    },
  },
});

export const persister = createSyncStoragePersister({
  storage: window.localStorage,
});

export const client = edenTreaty<App>(import.meta.env.VITE_API_URL, {
  $fetch: {
    credentials: "include",
  },
});

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  defaultPreloadStaleTime: 0,
  context: {
    queryClient,
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: persister,
        }}
      >
        <RouterProvider router={router} />
      </PersistQueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
