"use client";

import Sidebar from "@/app/components/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: "var(--canvas)" }}>
      <Sidebar />
      <main style={{ marginLeft: "var(--sidebar-w)" }}>
        {children}
      </main>
    </div>
  );
}
