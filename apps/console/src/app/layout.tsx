import type { Metadata } from 'next';
import './globals.css';
import { ConsoleShell } from '@/components/ConsoleShell';

export const metadata: Metadata = {
  title: 'Syntrabase — Developer Console',
  description: 'Syntrabase: Self-hosted Firebase alternative developer console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        <ConsoleShell>{children}</ConsoleShell>
      </body>
    </html>
  );
}
