import './globals.css';

export const metadata = {
  title: 'SaaS Builder',
  description: 'Build and deploy SaaS applications',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
