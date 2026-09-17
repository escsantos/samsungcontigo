import "./globals.css";
import { CarrinhoProvider } from "../contexts/CarrinhoContext";

export const metadata = {
  title: "Samsung Contigo — Grupo J.Macedo",
  description: "Consulta de peças, orçamentos e estoque — Grupo J.Macedo",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Samsung Contigo"
  }
};

export const viewport = {
  themeColor: "#1B4162",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Inter:wght@400;500;600&family=VT323&family=Fredoka:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="icon" href="/icons/icon-192.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var tema = localStorage.getItem('tema');
                if (tema === 'dark' || (!tema && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                }
                var temaVisual = localStorage.getItem('tema_visual');
                if (temaVisual && temaVisual !== 'original') {
                  document.documentElement.setAttribute('data-tema-visual', temaVisual);
                }
              } catch (e) {}
            `
          }}
        />
      </head>
      <body><CarrinhoProvider>{children}</CarrinhoProvider></body>
    </html>
  );
}
