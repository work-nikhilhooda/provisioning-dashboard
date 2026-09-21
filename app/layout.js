import './globals.css';

export const metadata = {
  title: 'Network Provisioning Dashboard',
  description: 'IntelliQA twin-app demo — App B',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
