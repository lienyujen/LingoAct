import { uiText, uiFormat } from '../lib/uiText'
import type { ReactNode } from 'react'
import { participantBrand } from '../lib/brand'
import japaneseLogo from '../assets/jp-logo.png'

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

export function StudentSocialLinks({ teachingLanguage }: { teachingLanguage?: string } = {}) {
  const brand = participantBrand(new URLSearchParams(window.location.hash.split('?')[1] || window.location.search), teachingLanguage)
  const links: SocialLink[] = brand === 'japanese' ? [{
    href: 'https://www.welearnjapanese.com/', label: 'towa', title: uiText('東禾國際外語學校'),
    icon: <img src={japaneseLogo} alt={uiText('東禾國際外語學校')} />,
  }] : socialLinks

  return (
    <nav aria-label={uiText("社群連結")} className="student-social-links">
      {links.map((link) => (
        <a
          aria-label={uiFormat("在新分頁開啟{0}", [link.title || link.label])}
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
