"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Clapperboard, History, LogIn, LogOut, PlusCircle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/create", label: "创建任务", icon: PlusCircle },
  { href: "/history", label: "历史记录", icon: History }
];

type SiteHeaderProps = {
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
};

export function SiteHeader({ user }: SiteHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST"
    });
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-slate-950">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Clapperboard className="h-5 w-5" />
          </span>
          <span className="truncate text-base font-semibold">换品片场</span>
        </Link>
        <nav className="flex items-center gap-1">
          {user
            ? navItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Button
                    key={item.href}
                    asChild
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className={cn("h-9 rounded-md px-3", active && "text-secondary-foreground")}
                  >
                    <Link href={item.href}>
                      <Icon className="mr-2 h-4 w-4" />
                      <span className="hidden sm:inline">{item.label}</span>
                    </Link>
                  </Button>
                );
              })
            : null}
          {user ? (
            <>
              <span className="hidden max-w-48 truncate px-2 text-sm text-slate-500 md:inline">
                {user.email}
              </span>
              <Button variant="ghost" size="sm" className="h-9 rounded-md px-3" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">退出</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                asChild
                variant={pathname === "/login" ? "secondary" : "ghost"}
                size="sm"
                className="h-9 rounded-md px-3"
              >
                <Link href="/login">
                  <LogIn className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">登录</span>
                </Link>
              </Button>
              <Button
                asChild
                variant={pathname === "/register" ? "secondary" : "ghost"}
                size="sm"
                className="h-9 rounded-md px-3"
              >
                <Link href="/register">
                  <UserPlus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">注册</span>
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
