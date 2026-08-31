import React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Globe2, Wand2, BookImage, Satellite, Compass, Sparkles, Wifi, Stamp,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    icon: Globe2,
    accent: "text-cyan",
  },
  {
    to: "/trips",
    label: "Mis Viajes",
    icon: Compass,
    accent: "text-violet",
  },
  {
    to: "/studio",
    label: "El Estudio",
    icon: Wand2,
    accent: "text-cyan",
  },
  {
    to: "/collection",
    label: "Mi Álbum",
    icon: BookImage,
    accent: "text-coral",
  },
  {
    to: "/passport",
    label: "LEGO Passport",
    icon: Stamp,
    accent: "text-amber-400",
  },
  {
    to: "/generator",
    label: "Centro Satelital",
    icon: Satellite,
    accent: "text-neon",
  },
];

export function AppSidebar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-white/10 bg-[#07070b]/90 backdrop-blur-2xl transition-all duration-300"
    >
      {/* Brand Header */}
      <SidebarHeader className="p-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet to-cyan flex items-center justify-center flex-shrink-0">
            <Globe2 className="h-4 w-4 text-white" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0 transition-opacity duration-200">
              <h1 className="font-display font-bold text-sm tracking-tight text-white leading-none">
                PIN COLLECTOR
              </h1>
              <p className="text-[11px] font-sans text-muted-fg mt-0.5 tracking-normal">
                Colección de Pines
              </p>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Navigation Links */}
      <SidebarContent className="p-3">
        <SidebarMenu className="space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));

            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={item.label}
                  className={cn(
                    "h-10 rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-white/[0.08] text-white border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_4px_16px_-4px_rgba(99,102,241,0.3)] font-medium"
                      : "text-muted-fg hover:text-white hover:bg-white/[0.04]"
                  )}
                >
                  <Link to={item.to} className="flex items-center gap-3 w-full">
                    <Icon className={cn("h-4 w-4 flex-shrink-0", item.accent)} />
                    {!isCollapsed && (
                      <span className="text-xs font-medium tracking-tight truncate">
                        {item.label}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      {/* Footer NFC Status */}
      <SidebarFooter className="p-3 border-t border-white/10">
        {!isCollapsed ? (
          <div className="p-3 rounded-xl glass border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-neon shadow-[0_0_8px_#10b981]" />
              </span>
              <span className="text-[11px] font-medium text-white/90">Sincronización NFC</span>
            </div>
            <Wifi className="h-3.5 w-3.5 text-neon" />
          </div>
        ) : (
          <div className="flex items-center justify-center p-2">
            <Wifi className="h-4 w-4 text-neon shadow-[0_0_8px_#10b981]" />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
