import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { reportLovableError } from "../lib/lovable-error-reporting";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pin Collector — Premium Dashboard & Álbum de Viajes" },
      { name: "description", content: "Dashboard premium para coleccionar pines de viaje, cartulinas satelitales con acuarela y rutas por el mundo." },
      { property: "og:title", content: "Pin Collector — Premium Dashboard & Álbum de Viajes" },
      { property: "og:description", content: "Dashboard premium para coleccionar pines de viaje, cartulinas satelitales con acuarela y rutas por el mundo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pin Collector — Premium Dashboard & Álbum de Viajes" },
      { name: "twitter:description", content: "Dashboard premium para coleccionar pines de viaje, cartulinas satelitales con acuarela y rutas por el mundo." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/38b16a27-74df-428d-a726-fc305bcb81d3/id-preview-0310eaf1--f874af7a-eccd-4b89-a140-2842ebcdb8c9.lovable.app-1784488350268.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/38b16a27-74df-428d-a726-fc305bcb81d3/id-preview-0310eaf1--f874af7a-eccd-4b89-a140-2842ebcdb8c9.lovable.app-1784488350268.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen w-full bg-[#050508] text-[#f4f5fb]">
        <AppSidebar />
        <main className="flex-1 flex flex-col relative w-full overflow-hidden min-h-screen">
          {/* Top Glass Header */}
          <header className="h-16 border-b border-white/10 bg-[#050508]/60 backdrop-blur-2xl z-30 sticky top-0 px-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-cyan shadow-[0_0_8px_#00d4ff]" />
              <h1 className="font-display font-bold text-sm tracking-tight text-white uppercase">
                Orbita · Pin Collector Studio
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono text-muted-fg bg-white/5 px-3 py-1 rounded-full border border-white/10">
                v2.4 · Cinematic Engine
              </span>
            </div>
          </header>

          {/* Main Body Canvas */}
          <div className="flex-1 overflow-auto p-6 orbita-grain">
            <Outlet />
          </div>
        </main>
      </div>
      <Toaster theme="dark" />
    </QueryClientProvider>
  );
}

