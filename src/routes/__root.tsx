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
import { AppSidebar } from "@/components/AppSidebar";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050508] text-white px-4 orbita-grain">
      <div className="max-w-md text-center glass-strong p-8 rounded-3xl border border-white/15 shadow-2xl space-y-4">
        <h1 className="text-7xl font-bold font-display text-cyan">404</h1>
        <h2 className="text-xl font-semibold text-white">Página no encontrada</h2>
        <p className="text-sm text-muted-fg">
          La ruta solicitada no existe o ha sido reubicada.
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-violet px-5 py-2.5 text-xs font-semibold text-white transition-all hover:bg-violet/90 shadow-[0_0_16px_rgba(108,99,255,0.4)]"
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
    <div className="flex min-h-screen items-center justify-center bg-[#050508] text-white p-6 orbita-grain">
      <div className="max-w-lg w-full glass-strong rounded-3xl p-8 border border-white/15 shadow-2xl text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-coral/15 border border-coral/30 text-coral flex items-center justify-center mx-auto text-xl shadow-[0_0_20px_rgba(255,107,107,0.3)]">
          ⚠️
        </div>
        <h1 className="font-display text-xl font-bold tracking-tight text-white">
          Aviso de Ejecución
        </h1>
        <p className="text-xs text-muted-fg leading-relaxed">
          {error?.message || "Se produjo una inconsistencia temporal al renderizar los datos."}
        </p>
        {error?.stack && (
          <pre className="text-[10px] font-mono text-left bg-black/60 p-3 rounded-xl overflow-auto max-h-36 text-white/60 border border-white/10">
            {error.stack}
          </pre>
        )}
        <div className="pt-2 flex gap-3 justify-center">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="px-5 py-2.5 rounded-xl bg-violet hover:bg-violet/90 text-white font-semibold text-xs transition-all shadow-[0_0_16px_rgba(108,99,255,0.4)]"
          >
            Reintentar Carga
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
      { title: "Pin Collector — Premium Dashboard & Álbum de Viajes" },
      { name: "description", content: "Dashboard premium para coleccionar pines de viaje, cartulinas satelitales con acuarela y rutas por el mundo." },
      { property: "og:title", content: "Pin Collector — Premium Dashboard & Álbum de Viajes" },
      { property: "og:description", content: "Dashboard premium para coleccionar pines de viaje, cartulinas satelitales con acuarela y rutas por el mundo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Pin Collector — Premium Dashboard & Álbum de Viajes" },
      { name: "twitter:description", content: "Dashboard premium para coleccionar pines de viaje, cartulinas satelitales con acuarela y rutas por el mundo." },
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
      <body className="bg-[#050508] text-[#f4f5fb] min-h-screen">
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
