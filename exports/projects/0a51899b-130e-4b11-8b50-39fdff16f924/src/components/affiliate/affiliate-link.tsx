'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function AffiliateLink({ code, salonSlug }: { code: string; salonSlug: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/${salonSlug}?ref=${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
      <code className="flex-1 text-sm">{link}</code>
      <button onClick={handleCopy} className="btn-ghost btn-sm">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}