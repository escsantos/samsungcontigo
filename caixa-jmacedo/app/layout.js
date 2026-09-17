import "./globals.css";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import TemaProvider from "../components/TemaProvider";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-space-grotesk" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-ibm-plex-mono" });

export const metadata = {
  title: "Controle de Orçamentos (OW) — Balcão | Grupo J.Macedo",
  description: "Controle de caixa das assistências técnicas do Grupo J.Macedo",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" className={`${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}>
      <body>
        <TemaProvider />
        {children}
      </body>
    </html>
  );
}
