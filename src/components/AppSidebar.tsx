import React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Globe2, Wand2, BookImage, Satellite, Compass, Sparkles,
  Wifi, ChevronRight, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    sublabel: "Centro de Control",
    icon: Globe2,
    badge: null,
    accent: "text-cyan",
  },
  {
    to: "/trips",
    label: "Mis Viajes",
    sublabel: "Rutas y Ciudades",
    icon: Compass,
    badge: "14",
    accent: "text-violet",
  },
  {
    to: "/studio",
    label: "El Estudio",
    sublabel: "Digitalizador OpenCV",
    icon: Wand2,
    badge: "ZIP / Cam",
    accent: "text-cyan",
  },
  {
    to: "/collection",
    label: "Mi Álbum",
    sublabel: "Colección Cronológica",
    icon: BookImage,
    badge: "3×4",
    accent: "text-coral",
  },
  {
    to: "/generator",
    label: "Centro Satelital",
    sublabel: "Cartulinas WYSIWYG",
    icon: Satellite,
    badge: "Live",
    accent: "text-neon",
  },
];

export function AppSidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col justify-between p-4 border-r border-white/10 bg-[#050508]/80 backdrop-blur-2xl z-40 min-h-screen">
      {/* Brand Header */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2 py-2">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-violet to-cyan flex items-center justify-center shadow-[0_0_24px_-4px_rgba(108,99,255,0.6)]">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-base tracking-tight text-white leading-none">
              ORBITA
            </h1>
            <p className="text-[10px] font-mono text-muted-fg mt-1 tracking-wider uppercase">
              Pin Collector
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.to;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center justify-between px-3.5 py-3 rounded-2xl transition-all duration-200 group relative",
                  isActive
                    ? "bg-white/[0.08] text-white border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_24px_-8px_rgba(108,99,255,0.4)]"
                    : "text-muted-fg hover:text-white hover:bg-white/[0.04] border border-transparent"
                )}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-gradient-to-b from-cyan to-violet" />
                )}

                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center transition-colors",
                      isActive ? "bg-white/10 text-white" : "text-muted-fg group-hover:text-white"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", item.accent)} />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-semibold tracking-tight truncate leading-tight">
                      {item.label}
                    </p>
                    <p className="text-[10px] text-muted-fg truncate leading-tight mt-0.5">
                      {item.sublabel}
                    </p>
                  </div>
                </div>

                {item.badge && (
                  <span
                    className={cn(
                      "text-[9px] font-mono px-2 py-0.5 rounded-full border",
                      isActive
                        ? "bg-cyan/15 text-cyan border-cyan/30"
                        : "bg-white/5 text-muted-fg border-white/10"
                    )}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer NFC Status Card */}
      <div className="p-3.5 rounded-2xl glass border border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-neon shadow-[0_0_8px_#00ffb2]" />
            </span>
            <span className="text-[11px] font-semibold text-white">NFC Hardware</span>
          </div>
          <Wifi className="h-3.5 w-3.5 text-neon" />
        </div>
        <p className="text-[10px] text-muted-fg leading-relaxed">
          Infraestructura lista para sincronización con el álbum físico.
        </p>
      </div>
    </aside>
  );
}
