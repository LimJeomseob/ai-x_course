import { PortalShell } from "@/components/PortalShell";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell locale="ko">{children}</PortalShell>;
}
