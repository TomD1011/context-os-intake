import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Context OS Intake — FounderOS',
  description: 'Structured business context extraction for system design.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50">
        {children}
      </body>
    </html>
  )
}
