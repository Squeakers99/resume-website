import "./homepage.css";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <section className="homepage-panel" aria-label="Homepage section">
        <div className="homepage-grid">
          <div className="homepage-copy">
            <p className="homepage-intro">
              <span className="typewriter-name" aria-label="Hi, I'm Soheil Rajabali">
                <span className="typewriter-text">Hi, I&apos;m Soheil Rajabali</span>
              </span>
            </p>
            <h1>Mechatronics Engineer &amp; Software Developer</h1>
            <p className="homepage-summary">
              I design and build mechanical, electrical, and software systems.
            </p>
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

      </section>
    </main>
  );
}
