import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./component/Navbar";
import PinLock from "./component/Pinlock";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "My POS — บุญชอบเครื่องครัว",
  description: "ระบบ POS บุญชอบเครื่องครัว สามแยก",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100`}>
        <PinLock>
          <div className="flex min-h-screen">
            <Navbar />
            <main className="flex-1 min-w-0 pb-20 md:pb-0 overflow-y-auto">
              {children}
            </main>
          </div>
        </PinLock>
      </body>
    </html>
  );
}
