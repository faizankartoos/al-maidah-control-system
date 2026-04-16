function loaderSizeClass(size) {
  if (size === "sm") return "system-loader--sm";
  if (size === "lg") return "system-loader--lg";
  return "system-loader--md";
}

export function LoaderGlyph({ size = "md", className = "" }) {
  return (
    <span className={`system-loader ${loaderSizeClass(size)} ${className}`.trim()} aria-hidden="true">
      <span className="system-loader__halo" />
      <span className="system-loader__ring" />
      <span className="system-loader__ring system-loader__ring--reverse" />
      <span className="system-loader__core" />
    </span>
  );
}

export function InlineLoaderLabel({ label, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center gap-3 ${className}`.trim()}>
      <LoaderGlyph size="sm" />
      <span>{label}</span>
    </span>
  );
}

export function InlineButtonContent({ busy, busyLabel, children, className = "" }) {
  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`.trim()}>
      {busy ? <LoaderGlyph size="sm" /> : null}
      <span>{busy ? busyLabel : children}</span>
    </span>
  );
}

export function PanelLoader({
  eyebrow = "Working",
  label = "Loading...",
  description = "",
  className = "",
}) {
  return (
    <div className={`rounded-[24px] border border-slate-800 bg-slate-900/65 px-5 py-7 text-center shadow-[0_22px_50px_rgba(15,23,42,0.18)] ${className}`.trim()}>
      <div className="flex flex-col items-center gap-3">
        <LoaderGlyph size="lg" className="text-cyan-300" />
        <div className="text-[10px] font-semibold uppercase tracking-[0.34em] text-cyan-300">
          {eyebrow}
        </div>
        <div className="text-base font-semibold text-white">{label}</div>
        {description ? (
          <div className="max-w-xl text-sm leading-6 text-slate-400">{description}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ScreenLoader({
  eyebrow = "Working",
  label = "Loading...",
  description = "",
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-white">
      <div className="w-full max-w-lg rounded-[32px] border border-slate-800 bg-slate-900/85 px-8 py-9 text-center shadow-[0_35px_95px_rgba(15,23,42,0.42)] backdrop-blur-xl">
        <div className="mx-auto flex w-full flex-col items-center gap-4">
          <LoaderGlyph size="lg" className="text-emerald-300" />
          <div className="text-[11px] font-semibold uppercase tracking-[0.36em] text-emerald-300">
            {eyebrow}
          </div>
          <div className="text-2xl font-semibold tracking-tight text-white">{label}</div>
          {description ? (
            <div className="max-w-md text-sm leading-6 text-slate-400">{description}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
