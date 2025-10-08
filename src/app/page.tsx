"use client";

import Link from "next/link";

export default function StartPage() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-[conic-gradient(at_50%_50%,#a78bfa_0deg,#60a5fa_120deg,#22d3ee_240deg,#a78bfa_360deg)] opacity-20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-[28rem] w-[28rem] rounded-full bg-[conic-gradient(at_50%_50%,#34d399_0deg,#fde047_120deg,#f472b6_240deg,#34d399_360deg)] opacity-20 blur-3xl" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.08]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Centered content */}
      <div className="relative mx-auto flex min-h-screen max-w-4xl items-center justify-center px-6">
        <div className="flex w-full flex-col items-center text-center">
          <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs text-slate-600 backdrop-blur">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" />
            Painted Geometry
          </div>
          <h1 className="bg-gradient-to-b from-slate-900 to-slate-600 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl md:text-5xl">
            chào mừng bạn đến với painted geometry
          </h1>
          <p className="mt-4 max-w-2xl text-balance text-slate-600">
            Khám phá thế giới hình học tinh giản, phối màu tinh tế và bố cục sạch sẽ.
          </p>

          <div className="mt-8">
            <Link
              href="/geometry"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-white shadow-sm transition hover:bg-slate-800"
            >
              Bắt đầu
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
