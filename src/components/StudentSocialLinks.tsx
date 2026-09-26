import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import ncaclsMark from '../assets/ncacls-mark.png'
import { brandFromSearch } from '../lib/brand'

type SocialLink = {
  href: string
  label: string
  // What the anchor is called to a screen reader, when the label alone would
  // not say it: "Facebook" is enough, "全美中文學校聯合總會" is the thing the
  // link goes to rather than the name of a service.
  title?: string
  icon: ReactNode
}

const facebookIcon = (
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.02 10.13 11.93v-8.49H7.08v-3.44h3.05V9.46c0-3.02 1.79-4.68 4.53-4.68 1.31 0 2.68.23 2.68.23v2.97h-1.51c-1.49 0-1.96.93-1.96 1.88v2.21h3.33l-.53 3.44h-2.8V24C19.61 23.09 24 18.1 24 12.07Z" />
  </svg>
)

const socialLinks: SocialLink[] = [
  {
    href: 'https://www.facebook.com/lienyujen',
    label: 'Facebook',
    icon: facebookIcon,
  },
  {
    href: 'https://www.youtube.com/@lienlaoshi',
    label: 'YouTube',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M23.5 6.2a3 3 0 0 0-2.1-2.13C19.53 3.57 12 3.57 12 3.57s-7.53 0-9.4.5A3 3 0 0 0 .5 6.2 31.2 31.2 0 0 0 0 12a31.2 31.2 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.13c1.87.5 9.4.5 9.4.5s7.53 0 9.4-.5a3 3 0 0 0 2.1-2.13A31.2 31.2 0 0 0 24 12a31.2 31.2 0 0 0-.5-5.8Z" />
        <path className="youtube-play" d="m9.6 15.6 6.26-3.6L9.6 8.4v7.2Z" />
      </svg>
    ),
  },
]

// 全美中文學校聯合總會. The same two places, pointing at the organisation the
// students actually belong to: their Facebook page, and their own site in
// place of the YouTube channel — marked with the edition's own app icon, so
// the link looks like the app the class is already using.
const ncaclsLinks: SocialLink[] = [
  {
    href: 'https://www.facebook.com/NCACLS/',
    label: 'Facebook',
    title: '全美中文學校聯合總會 Facebook',
    icon: facebookIcon,
  },
  {
    href: 'https://sites.google.com/ncacls.net/ncacls2021',
    label: 'NCACLS',
    title: '全美中文學校聯合總會',
    icon: <img alt="" src={ncaclsMark} />,
  },
]

export function StudentSocialLinks() {
  const [searchParams] = useSearchParams()
  const links = brandFromSearch(searchParams) === 'ncacls' ? ncaclsLinks : socialLinks

  return (
    <nav aria-label="社群連結" className="student-social-links">
      {links.map((link) => (
        <a
          aria-label={`在新分頁開啟${link.title || link.label}`}
          className={`student-social-link ${link.label.toLowerCase()}`}
          href={link.href}
          key={link.label}
          rel="noopener noreferrer"
          target="_blank"
          title={link.title || link.label}
        >
          {link.icon}
        </a>
      ))}
    </nav>
  )
}
