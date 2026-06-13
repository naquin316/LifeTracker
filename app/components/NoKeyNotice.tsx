export default function NoKeyNotice() {
  return (
    <div className="grid flex-1 place-items-center p-8">
      <div className="max-w-md rounded-xl border border-border bg-panel p-6 text-sm leading-relaxed">
        <h2 className="mb-2 text-base font-semibold">Add your Google Maps key</h2>
        <p className="mb-3 text-muted">
          The map needs a browser API key to render. Add one to{" "}
          <code className="rounded bg-panel-2 px-1.5 py-0.5 text-foreground">
            .env.local
          </code>
          :
        </p>
        <pre className="mb-3 overflow-x-auto rounded-lg bg-panel-2 p-3 text-[12px] text-foreground">
          NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY=your-key
        </pre>
        <p className="text-muted">
          Enable the <strong>Maps JavaScript API</strong> (browser key) plus{" "}
          <strong>Geocoding</strong>, <strong>Places</strong>,{" "}
          <strong>Roads</strong>, and <strong>Directions</strong> (server key) in
          Google Cloud. See <code>.env.example</code> for details, then restart
          the dev server.
        </p>
      </div>
    </div>
  );
}
