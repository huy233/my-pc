"use client";

import Link from "next/link";
import { useState } from "react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen((prev) => !prev);
  const closeMenu = () => setIsOpen(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-black/20 backdrop-blur supports-[backdrop-filter]:bg-black/10">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
          <span>Painted Geometry</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm sm:flex">
          <Link href="/" className="opacity-90 transition hover:opacity-100">
            Trang chủ
          </Link>
          <Link href="/geometry" className="opacity-90 transition hover:opacity-100">
            Geometry
          </Link>
          <Link href="/about" className="opacity-90 transition hover:opacity-100">
            Giới thiệu
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          aria-label="Mở menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-white sm:hidden"
          onClick={toggleMenu}
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            {isOpen ? (
              <path d="M6 18L18 6M6 6l12 12" />
            ) : (
              <>
                <path d="M3 6h18" />
                <path d="M3 12h18" />
                <path d="M3 18h18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {isOpen && (
        <div className="sm:hidden">
          <nav className="mx-2 mb-2 space-y-1 rounded-md border border-white/10 bg-black/40 p-2 backdrop-blur">
            <Link
              href="/"
              className="block rounded px-3 py-2 text-sm hover:bg-white/10"
              onClick={closeMenu}
            >
              Trang chủ
            </Link>
            <Link
              href="/geometry"
              className="block rounded px-3 py-2 text-sm hover:bg-white/10"
              onClick={closeMenu}
            >
              Geometry
            </Link>
            <Link
              href="/about"
              className="block rounded px-3 py-2 text-sm hover:bg-white/10"
              onClick={closeMenu}
            >
              Giới thiệu
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}


