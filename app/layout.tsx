import React from 'react';

export const metadata = {
  title: 'ChessPulse - Daily Puzzle',
  description: 'Daily Chess Puzzle & Soundboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#090d16' }}>
        {children}
      </body>
    </html>
  );
}
