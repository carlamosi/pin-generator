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
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { reportLovableError } from "../lib/lovable-error-reporting";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060609] text-white px-4">
      <div className="max-w-md text-center glass-strong p-8 rounded-3xl border border-white/10 shadow-2xl space-y-4">
        <h1 className="text-7xl font-bold font-display text-cyan">404</h1>
        <h2 className="text-xl font-semibold text-white">Página no encontrada</h2>
        <p className="text-sm text-muted-fg">
          La ruta solicitada no existe o ha sido reubicada.
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-violet px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-violet/90"
          >
            Ir al Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("Root caught error:", error);
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#060609] text-white p-6">
      <div className="max-w-lg w-full glass-strong rounded-3xl p-8 border border-white/10 shadow-2xl text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-coral/15 border border-coral/30 text-coral flex items-center justify-center mx-auto text-xl">
          ⚠️
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight text-white">
          Aviso de Ejecución
        </h1>
        <p className="text-xs text-muted-fg leading-relaxed">
          {error?.message || "Se produjo una inconsistencia temporal al renderizar los datos."}
        </p>
        <div className="pt-2 flex gap-3 justify-center">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="px-5 py-2.5 rounded-xl bg-violet hover:bg-violet/90 text-white font-semibold text-xs transition-all"
          >
            Reintentar
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-xs border border-white/15 transition-all"
          >
            Volver al Inicio
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
      { title: "Pin Collector — Colección y Archivo de Viajes" },
      { name: "description", content: "Catálogo de pines de viaje, cartulinas satelitales y expediciones." },
      { property: "og:title", content: "Pin Collector — Colección y Archivo de Viajes" },
      { property: "og:description", content: "Catálogo de pines de viaje, cartulinas satelitales y expediciones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pin Collector — Colección y Archivo de Viajes" },
      { name: "twitter:description", content: "Catálogo de pines de viaje, cartulinas satelitales y expediciones." },
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
    <html lang="es" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#060609] text-[#f4f5fb] min-h-screen">
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
      <SidebarProvider defaultOpen={true}>
        <div className="flex min-h-screen w-full bg-[#060609] text-[#f4f5fb]">
          <AppSidebar />
          <main className="flex-1 flex flex-col relative w-full overflow-hidden min-h-screen">
            {/* Top Glass Header with Collapsible Trigger */}
            <header className="h-14 border-b border-white/10 bg-[#060609]/70 backdrop-blur-xl z-30 sticky top-0 px-4 md:px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SidebarTrigger className="text-muted-fg hover:text-white hover:bg-white/10 rounded-lg h-8 w-8" />
                <h1 className="font-display font-semibold text-sm tracking-tight text-white">
                  Pin Collector
                </h1>
              </div>
            </header>

            {/* Main Body Canvas */}
            <div className="flex-1 overflow-auto p-4 md:p-6">
              <Outlet />
            </div>
          </main>
        </div>
        <Toaster theme="dark" />
      </SidebarProvider>
    </QueryClientProvider>
  );
}
