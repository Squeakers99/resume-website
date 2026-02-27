import "./homepage.css";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <div aria-label="Homepage section">
        <div className="homepage-grid">
          <div className="homepage-copy">
            <p className="homepage-intro">Hi, I&apos;m Soheil Rajabali</p>
            <h1>Mechatronics Engineer &amp; Software Developer</h1>
            <p className="homepage-tags">Robotics - Automation - AI Systems - Full-Stack</p>

            <div className="homepage-actions">
              <a className="btn btn-primary" href="#projects">
                View Projects
              </a>
              <a className="btn btn-secondary" href="#resume">
                Download Resume
              </a>
            </div>
          </div>

          <div className="homepage-visual" role="presentation">
            <div className="portrait-frame">
              <img
                src="/profile-picture.png"
                alt="Portrait of Soheil Rajabali"
                className="portrait-image"
              />
            </div>
          </div>
        </div>

        <footer className="status-bar" aria-label="Current focus areas">
          <span>
            System Status: <strong>Online</strong>
          </span>
          <span>Robotics</span>
          <span>CAD Design</span>
        </footer>
      </div>
    </main>
  );
}
