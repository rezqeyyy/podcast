'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { MARKUP } from '../lib/markup';
import { startStudio } from '../lib/engine';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function parseIce() {
  try { return JSON.parse(process.env.NEXT_PUBLIC_ICE_SERVERS || 'null') || undefined; }
  catch { return undefined; }
}

let client = null;
function getClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}

export default function Studio() {
  const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  useEffect(() => {
    if (!configured) return;
    return startStudio({ supabase: getClient(), iceServers: parseIce() });
  }, [configured]);

  if (!configured) {
    return (
      <div className="home">
        <div className="logo"><span className="dot" />Podcast Studio</div>
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Belum disetting</h2>
          <p className="muted">
            Isi <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> di
            file <code>.env.local</code> (lokal) atau di Vercel → Settings → Environment Variables,
            terus jalanin ulang / redeploy. Lihat README.
          </p>
        </div>
      </div>
    );
  }

  // The UI is static markup; lib/engine.js wires up all behaviour after mount.
  return <div dangerouslySetInnerHTML={{ __html: MARKUP }} />;
}
