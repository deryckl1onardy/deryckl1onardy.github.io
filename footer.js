(function () {
  const currentYear = new Date().getFullYear();

  const footerMarkup = `
    <div class="site-footer__inner">
      <div class="site-footer__grid">
        <section class="site-footer__brand" aria-label="Footer profile">
          <img class="site-footer__avatar" src="avatar.svg" alt="Portrait illustration of Derrick" />

          <div class="site-footer__brand-copy">
            <h2 class="site-footer__name">Derrick</h2>
            <p class="site-footer__role">UX / Product Designer</p>
            <p class="site-footer__tagline">Designed with clarity and a little nostalgia.</p>
          </div>
        </section>

        <section class="site-footer__column">
          <p class="site-footer__eyebrow">Email</p>
          <a class="site-footer__text-link" href="mailto:derrick@lionardy.com">derrick@lionardy.com</a>
        </section>

        <section class="site-footer__column">
          <p class="site-footer__eyebrow">Based in</p>
          <p class="site-footer__text">Indonesia</p>
        </section>

        <section class="site-footer__column site-footer__column--connect">
          <p class="site-footer__eyebrow">Let's connect</p>

          <nav class="site-footer__socials" aria-label="Social links">
            <a class="site-footer__social-link" href="https://www.linkedin.com/in/derycklionardy/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6.94 8.5a1.56 1.56 0 1 1 0-3.12 1.56 1.56 0 0 1 0 3.12ZM5.6 9.75h2.68v8.65H5.6V9.75Zm4.36 0h2.57v1.18h.04c.36-.68 1.23-1.4 2.53-1.4 2.7 0 3.2 1.78 3.2 4.09v4.78h-2.67v-4.24c0-1.01-.02-2.31-1.41-2.31-1.41 0-1.62 1.1-1.62 2.24v4.31H9.96V9.75Z" fill="currentColor"></path>
              </svg>
            </a>
            <a class="site-footer__social-link" href="mailto:derrick@lionardy.com" aria-label="Send email to Derrick">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm0 2 8 5 8-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            </a>
            <a class="site-footer__social-link" href="https://x.com/derycklionardy" target="_blank" rel="noreferrer" aria-label="X">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.53 3H20.5l-6.49 7.42L21.64 21h-5.98l-4.68-6.12L5.63 21H2.65l6.94-7.93L2.25 3h6.13l4.23 5.58L17.53 3Zm-1.04 16.2h1.65L7.47 4.72H5.7L16.49 19.2Z" fill="currentColor"></path>
              </svg>
            </a>
          </nav>
        </section>
      </div>

      <p class="site-footer__copyright">&copy; ${currentYear} Derrick. All rights reserved.</p>
    </div>
  `;

  document.querySelectorAll(".site-footer").forEach((footer) => {
    footer.innerHTML = footerMarkup;
    footer.dataset.footerReady = "true";
  });
})();
