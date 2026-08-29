import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup,
  SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarSeparator,
} from "@/components/ui/sidebar";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Globe, Wand2, BookImage, Satellite, Pin, Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard", exact: true },
  { to: "/trips", icon: Globe, label: "Mis Viajes" },
  { to: "/studio", icon: Wand2, label: "El Estudio" },
  { to: "/collection", icon: BookImage, label: "Mi Álbum" },
  { to: "/generator", icon: Satellite, label: "Centro Satelital" },
];

export function AppSidebar() {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="pb-2">
        <div className="flex items-center gap-2 px-2 py-3 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md flex-shrink-0">
            <Pin className="h-4 w-4" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-semibold tracking-tight">Pin Collector</p>
            <p className="text-xs text-muted-foreground">Premium Dashboard</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarSeparator />

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground/60">
            Navegación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ to, icon: Icon, label, exact }) => {
                const isActive = exact ? pathname === to : pathname.startsWith(to);
                return (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={cn(
                        "transition-all duration-200",
                        isActive && "bg-primary/10 text-primary font-medium"
                      )}
                      tooltip={label}
                    >
                      <Link to={to}>
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarSeparator />

      <SidebarFooter className="pb-4">
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 flex-shrink-0">
            <Wifi className="h-3 w-3 text-emerald-600" />
          </div>
          <div className="group-data-[collapsible=icon]:hidden">
            <p className="text-xs font-medium text-emerald-700">NFC Ready</p>
            <p className="text-[10px] text-muted-foreground">Álbum físico conectado</p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
