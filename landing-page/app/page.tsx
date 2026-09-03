"use client";

import { useState } from "react";
import Image from "next/image";

function Logo() {
  return (
    <span className="logo-lockup">
      <span className="salse-mark" aria-hidden="true"><i /><i /></span>
      <strong>Salse</strong>
    </span>
  );
}

function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="check-list">
      {items.map((item) => <li key={item}><i>✓</i>{item}</li>)}
    </ul>
  );
}

function TargetVisual() {
  return (
    <div className="reference-feature target-reference" aria-hidden="true">
      <Image src="/salse-reference.webp" alt="" width={1024} height={5272} unoptimized />
    </div>
  );
}

function BalanceVisual() {
  return (
    <div className="reference-feature balance-reference" aria-hidden="true">
      <Image src="/salse-reference.webp" alt="" width={1024} height={5272} unoptimized />
    </div>
  );
}

function AiVisual() {
  return (
    <div className="reference-feature ai-reference" aria-hidden="true">
      <Image src="/salse-reference.webp" alt="" width={1024} height={5272} unoptimized />
    </div>
  );
}

const features = [
  {
    title: "Track your targets",
    text: "Set clear business targets & monitor your progress in real time. Know exactly how far you are from your goals",
    bullets: ["Real-time progress toward monthly and yearly targets", "Clear performance indicators with visual progress tracking", "Instant visibility into sales impact on your overall growth"],
    visual: <TargetVisual />,
  },
  {
    title: "Understand your balance",
    text: "Get a clear view of your business financial health without complex reports. Track trends, compare periods, and understand",
    bullets: ["Visual balance sheet trends by time period", "Easy comparison across months and years", "Clear insights into income and operational expenses"],
    visual: <BalanceVisual />,
  },
  {
    title: "AI highlight what truly matters",
    text: "Our AI continuously analyzes your business data to surface risks, opportunities, and key changes helping you focus on the right actions",
    bullets: ["Automated insights based on customer and financial data", "Early warnings on rising costs or declining performance", "Actionable recommendations, not just summaries"],
    visual: <AiVisual />,
  },
];

function PricingCard({ enterprise = false }: { enterprise?: boolean }) {
  return (
    <article className="pricing-card">
      <span className={`pricing-icon ${enterprise ? "diamond" : "person"}`} aria-hidden="true">{enterprise ? "♢" : "♟"}</span>
      <span className="plan-name">{enterprise ? "Enterprise Plan" : "Starting Plan"}</span>
      <h3>{enterprise ? "$120" : "$0"}<small>/{enterprise ? "Month" : "Account"}</small></h3>
      <p>{enterprise ? "Advanced tools and flexibility for teams that need deeper insights, control, and customization across business operations" : "Everything you need to manage customers, track performance, gain clear business insights perfect for small teams"}</p>
      <CheckList items={enterprise ? ["Everything in Starting Plan", "Advanced reporting dashboard", "Priority AI insights and recommendations", "Dedicated support & onboarding"] : ["Customer and sales tracking", "Financial overview & balance sheet insights", "Performance targets and progress tracking", "AI-powered business insights"]} />
      <a className={enterprise ? "plan-cta dark" : "plan-cta"} href="#cta">{enterprise ? "Get Started" : "Sign Up"}</a>
    </article>
  );
}

function Phones() {
  return (
    <div className="phones" aria-label="Salse mobile app screens">
      <Image src="/salse-reference.webp" alt="Three Salse mobile application screens" width={1024} height={5272} unoptimized />
    </div>
  );
}

const articles = [
  { tag: "#Business", author: "By Alex Johnson", title: "How to Winning Strategy", date: "October 17, 2025", crop: "article-one" },
  { tag: "#Analyst", author: "By Marcho Bunk", title: "Turning Data into Growth", date: "October 19, 2025", crop: "article-two" },
  { tag: "#Tutorial", author: "By Dwa Morchin", title: "Understanding Performance", date: "October 21, 2025", crop: "article-three" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="site-page">
      <header className="site-header page-shell">
        <a href="#home" aria-label="Salse home"><Logo /></a>
        <nav className={menuOpen ? "is-open" : ""} aria-label="Main navigation"><a href="#home" onClick={() => setMenuOpen(false)}>Home</a><a href="#features" onClick={() => setMenuOpen(false)}>Features</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><a href="#insight" onClick={() => setMenuOpen(false)}>Insight</a></nav>
        <button className="menu-button" type="button" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-label={menuOpen ? "Close navigation" : "Open navigation"}><i /><i /></button>
        <a className="login-button" href="#pricing">Login</a>
      </header>

      <section className="hero page-shell" id="home">
        <div className="hero-copy">
          <h1>Drive growth<br />confidently <em>with</em><br /><em>insight at every step</em></h1>
          <p>Understand customers more deeply while tracking revenue, expenses, and performance with all in one app</p>
          <a className="black-button" href="#pricing">Get Started</a>
        </div>
        <div className="hero-reference" aria-hidden="true"><Image src="/salse-reference.webp" alt="" width={1024} height={5272} priority unoptimized /></div>
      </section>

      <section className="section-heading page-shell" id="features">
        <span>Features</span><h2>See your business clearly<br /><em>all in one place</em></h2><p>Track customers, revenue, expenses, and performance in real time without jumping between tools or spreadsheets.</p>
      </section>

      <section className="feature-list page-shell">
        {features.map((feature) => <article className="feature-card" key={feature.title}><div className="feature-copy"><h3>{feature.title}</h3><p>{feature.text}</p><CheckList items={feature.bullets} /><a href="#pricing">Check Detail</a></div>{feature.visual}</article>)}
      </section>

      <section className="pricing-section" id="pricing">
        <div className="page-shell">
          <div className="pricing-heading"><span>Features</span><h2>Start for free and upgrade as your<br />business scales. No <b>▣</b> hidden fees,<br />no complicated setup, just clear<br /><em>value from day one</em></h2></div>
          <div className="pricing-grid"><PricingCard /><PricingCard enterprise /></div>
        </div>
      </section>

      <section className="phones-section page-shell"><Phones /></section>

      <section className="testimonial page-shell" id="testimonial">
        <button type="button" disabled aria-label="Previous testimonial unavailable">‹</button>
        <div><span className="avatar">HJ</span><blockquote>“ This platform helps us understand<br />our business more clearly. Insights feel<br />simple, relevant, and easy to act on as<br />we grow day by day ”</blockquote><strong>Huang Jong</strong><small>Business Analyst at PixelMatter</small></div>
        <button type="button" disabled aria-label="Next testimonial unavailable">›</button>
      </section>

      <section className="insight-section" id="insight">
        <div className="section-heading page-shell"><span>Features</span><h2>Insights, guides and ideas<br /><em>to grow your business</em></h2><p>Learn how to manage customers, understand performance, and make smarter decisions through practical articles & insights.</p></div>
        <div className="article-grid page-shell">
          {articles.map((article) => <article className="article-card" key={article.title}><div className={`article-image ${article.crop}`}><Image src="/salse-reference.webp" alt="" width={1024} height={5272} unoptimized /></div><div className="article-meta"><span>{article.tag}</span><small>{article.author}</small></div><h3>{article.title}</h3><time>{article.date}</time></article>)}
        </div>
        <a className="black-button view-more" href="#cta">View More</a>
      </section>

      <section className="cta-section page-shell" id="cta">
        <div className="cta-grid" aria-hidden="true">{Array.from({ length: 32 }).map((_, index) => <i key={index} />)}</div>
        <div className="floating-photo fp-one" aria-hidden="true" /><div className="floating-photo fp-two" aria-hidden="true" /><div className="floating-photo fp-three" aria-hidden="true" /><div className="floating-photo fp-four" aria-hidden="true" />
        <div className="cta-copy"><h2>Let’s grow with confidence,<br /><em>backed by real insights</em></h2><p>Track performance, understand your data, and take action<br />with clarity at every stage of your business</p><a className="black-button" href="#pricing">Get Started</a></div>
      </section>

      <section className="stats page-shell"><div><strong>14.5K</strong><span>Total Download App</span></div><div><strong>6.2K</strong><span>Total Business</span></div><div><strong>12.3K</strong><span>Total Users</span></div><div><strong>350+</strong><span>Total Testimonials</span></div></section>

      <footer id="footer">
        <div className="footer-grid page-shell"><div className="footer-brand"><Logo /><p>Drive growth confidently with insight at<br />every step for your business</p><div><span>◎</span><span>◉</span><span>𝕏</span></div></div><div className="footer-column"><strong>Links</strong><a href="#features">Features app</a><a href="#pricing">Our Pricing</a><a href="#testimonial">Testimonials</a><a href="#insight">Articles & insight</a></div><div className="footer-column"><strong>Features</strong><a href="#features">Tracking target</a><a href="#features">Balance sheet</a><a href="#features">Artificial intelligence</a><a href="#features">Manage product</a></div><div className="footer-column"><strong>Others</strong><a href="#footer">Careers</a><a href="#footer">FAQ</a><a href="#footer">Help Center</a></div></div>
        <div className="copyright page-shell">©2025 Copyright Salse. All rights reserved.</div>
      </footer>
    </main>
  );
}
