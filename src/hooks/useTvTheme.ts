import { useCallback, useEffect, useState } from "react";

export type TvTheme = "light" | "dark";

const STORAGE_KEY = "zakatku:tv-theme";

/**
 * Tema papan /tv, disimpan per perangkat supaya tiap layar bisa punya pilihan sendiri.
 * Dibaca setelah mount karena halaman ini dirender statis; gelap adalah bawaannya.
 */
export function useTvTheme() {
  const [theme, setTheme] = useState<TvTheme>("dark");

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "light") setTheme("light");
    } catch {
      // Penyimpanan bisa diblokir browser TV; tema tetap berlaku sampai halaman dimuat ulang.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next: TvTheme = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Lihat catatan di atas.
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
