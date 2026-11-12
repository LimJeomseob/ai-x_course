import { PortalShell } from "@/components/PortalShell";

export default function EnglishPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell locale="en">{children}</PortalShell>;
}
