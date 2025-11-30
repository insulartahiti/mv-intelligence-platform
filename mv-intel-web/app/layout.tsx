import '../styles/globals.css';
import type { Metadata, Viewport } from 'next';
import CollapsibleMenu from './components/CollapsibleMenu';
import { ToastContainer } from './components/ui/AppShell';
import { PWAInstaller, PWAStatus } from './components/PWAInstaller';
import PWAScript from './components/PWAScript';

export const metadata: Metadata = {
  title: 'MV Intelligence Platform',
  description: 'Professional portfolio intelligence, deal management, and network insights platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MV Intelligence',
  },
  applicationName: 'MV Intelligence',
  authors: [{ name: 'Motive Ventures' }],
  keywords: ['portfolio', 'intelligence', 'deals', 'network', 'business'],
  robots: 'index, follow',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://mv-intelligence.com',
    title: 'MV Intelligence Platform',
    description: 'Professional portfolio intelligence, deal management, and network insights platform',
    siteName: 'MV Intelligence',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MV Intelligence Platform',
    description: 'Professional portfolio intelligence, deal management, and network insights platform',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#3b82f6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
               <link rel="icon" href="/mv-icons-48.png" />
               <link rel="apple-touch-icon" href="/mv-icons-192.png" />
               <link rel="icon" type="image/png" sizes="24x24" href="/mv-icons-24.png" />
               <link rel="icon" type="image/png" sizes="48x48" href="/mv-icons-48.png" />
               <link rel="icon" type="image/png" sizes="72x72" href="/mv-icons-72.png" />
               <link rel="icon" type="image/png" sizes="96x96" href="/mv-icons-96.png" />
               <link rel="icon" type="image/png" sizes="192x192" href="/mv-icons-192.png" />
               <link rel="icon" type="image/png" sizes="512x512" href="/mv-icons-512.png" />
        <meta name="msapplication-TileColor" content="#3b82f6" />
        <meta name="msapplication-TileImage" content="/mv-icons-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
               <meta name="apple-mobile-web-app-capable" content="yes" />
               <meta name="apple-mobile-web-app-status-bar-style" content="default" />
               <meta name="apple-mobile-web-app-title" content="MV Intelligence" />
      </head>
      <body className="app-backdrop text-onGlassDark">
        <CollapsibleMenu />
        <main className="min-h-screen">
          {children}
        </main>
        <ToastContainer />
        <PWAStatus />
        <PWAInstaller />
        <PWAScript />
      </body>
    </html>
  );
}
