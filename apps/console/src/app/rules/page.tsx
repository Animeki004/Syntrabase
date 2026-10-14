'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SecurityRulesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/database?tab=rules');
  }, [router]);

  return (
    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
      Redirecting to Database Security Rules...
    </div>
  );
}
