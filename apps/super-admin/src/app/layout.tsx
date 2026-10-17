import type { Metadata } from 'next';
import './globals.css';
import { SuperAdminShell } from '@/components/SuperAdminShell';

export const metadata: Metadata = {
  title: 'Syntrabase — Super Admin Command Center',
  description: 'Syntrabase: Multi-tenant platform operations, SOC defense, audit verification, and disaster recovery',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" id="dynamic-favicon" />
      </head>
      <body>
        <SuperAdminShell>{children}</SuperAdminShell>
      </body>
    </html>
  );
}
