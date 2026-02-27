import Image from "next/image";

const navItems = ["Home", "About Me", "Projects", "Contact", "Resume"];

export default function Home() {
  return (
    <main className="landing-shell">
      <div aria-label="Homepage hero section">
        <header className="hero-header">
          <div className="brand">
            <span className="brand-dot" aria-hidden="true" />
            <span className="brand-name">JOHN DOE</span>
          </div>

          <nav aria-label="Main navigation">
            <ul className="nav-list">
              {navItems.map((item) => (
                <li key={item}>
                  <a href="#">{item}</a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <p className="hero-intro">Hi, I&apos;m John Doe</p>
            <h1>Mechatronics Engineer &amp; Software Developer</h1>
            <p className="hero-tags">Robotics · Automation · AI Systems · Full-Stack</p>

            <div className="hero-actions">
              <a className="btn btn-primary" href="#projects">
                View Projects
              </a>
              <a className="btn btn-secondary" href="#resume">
                Download Resume
              </a>
            </div>
          </div>

          <div className="hero-visual" role="presentation">
            <div className="portrait-frame">
              <Image
                src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=640&q=80"
                alt="Portrait of John Doe"
                width={330}
                height={360}
                priority
              />
            </div>
          </div>
        </div>

        <footer className="status-bar" aria-label="Current focus areas">
          <span>System Status: <strong>Online</strong></span>
          <span>Robotics</span>
          <span>CAD Design</span>
        </footer>
      </div>
    </main>
  );
}

