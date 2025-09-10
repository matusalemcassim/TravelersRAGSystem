import './globals.css'

export const metadata = {
  title: 'Travelers ChatBot',
  description: 'AI ChatBot to help user answer they question about Traveler Insurance Company!!!',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
