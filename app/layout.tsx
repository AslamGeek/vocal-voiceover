import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Vocal — Voiceover Studio",
  description: "Turn your words and delivery direction into a voiceover. Listen and download a WAV.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
