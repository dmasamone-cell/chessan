import React from 'react';

export const metadata = {
  title: 'Chessigma Analyzer',
  description: 'Chess.com Game Analyzer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0b0e14' }}>
        {children}
      </body>
    </html>
  );
}
