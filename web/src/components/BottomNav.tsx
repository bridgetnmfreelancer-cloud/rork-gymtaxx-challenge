import { CalendarDays, House, User } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "/home", label: "Home", icon: House },
  { to: "/history", label: "History", icon: CalendarDays },
  { to: "/account", label: "Account", icon: User },
] as const;

/**
 * Fixed tab bar, sitting above the home indicator once installed.
 *
 * Deliberately three flat items with no badges: the dashboard already carries
 * every number that matters, and a badge here would compete with it.
 */
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg">
      <div
        className="mx-auto flex w-full max-w-md items-stretch justify-around px-2 pt-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex min-w-[4.5rem] flex-col items-center gap-1 rounded-md px-3 py-2 transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <tab.icon className="h-6 w-6" strokeWidth={isActive ? 2.4 : 1.8} aria-hidden="true" />
                <span className={cn("text-[0.6875rem]", isActive ? "font-semibold" : "font-medium")}>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
