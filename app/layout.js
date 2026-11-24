import './globals.css';

export const metadata = {
  title: 'Podcast Studio',
  description: 'Rekam podcast online bareng siapa aja. Kamera otomatis nyorot yang lagi ngomong.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0d10',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
