import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Rampestrek | Tegn og Animer",
  description: "En interaktiv tegne- og animasjonsapplikasjon for kreativ utfoldelse",
  metadataBase: new URL('https://rampestrek.iverfinne.no'),
  openGraph: {
    title: 'Rampestrek',
    description: 'Tegn og animer med Rampestrek',
    url: 'https://rampestrek.iverfinne.no',
    siteName: 'Rampestrek',
    locale: 'nb_NO',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="nb">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}