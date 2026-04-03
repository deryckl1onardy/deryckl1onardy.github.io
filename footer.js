(function () {
  const footerMarkup = `
    <span class="site-footer__corner site-footer__corner--tl" aria-hidden="true"></span>
    <span class="site-footer__corner site-footer__corner--br" aria-hidden="true"></span>
    <div class="site-footer__inner">
      <div class="site-footer__grid">
        <section class="site-footer__panel site-footer__panel--bio">
          <p class="site-footer__label">Product Designer</p>
          <h2 class="site-footer__name">
            <span class="site-footer__name-primary">Derrick</span>
            <span class="site-footer__name-secondary">Lionardy.</span>
          </h2>
          <div class="site-footer__bio">
            <p>// crafting digital payment</p>
            <p>// experiences for Indonesian.</p>
            <p>// design that never gets in</p>
            <p>// the way of the user.</p>
          </div>
          <div class="site-footer__availability">
            <span class="site-footer__availability-dot" aria-hidden="true"></span>
            <span>Available for projects</span>
          </div>
        </section>

        <section class="site-footer__panel site-footer__panel--works">
          <p class="site-footer__label">Selected Works</p>
          <div class="site-footer__works">
            <a class="site-footer__work-link is-active" href="dana-wallet-v3.html" data-footer-track="DANA Wallet">
              <span class="site-footer__work-number">01</span>
              <span class="site-footer__work-copy">
                <span class="site-footer__work-title">DANA Wallet</span>
                <span class="site-footer__work-cursor" aria-hidden="true">_</span>
              </span>
              <span class="site-footer__work-year">2022</span>
            </a>
            <a class="site-footer__work-link" href="weather-but-fun.html" data-footer-track="Weather - But Fun">
              <span class="site-footer__work-number">02</span>
              <span class="site-footer__work-copy">
                <span class="site-footer__work-title">Weather - But Fun</span>
                <span class="site-footer__work-cursor" aria-hidden="true">_</span>
              </span>
              <span class="site-footer__work-year">2026</span>
            </a>
            <a class="site-footer__work-link" href="index.html#work" data-footer-track="Onboarding &amp; Registration">
              <span class="site-footer__work-number">03</span>
              <span class="site-footer__work-copy">
                <span class="site-footer__work-title">Onboarding &amp; Registration</span>
                <span class="site-footer__work-cursor" aria-hidden="true">_</span>
              </span>
              <span class="site-footer__work-year">2022</span>
            </a>
            <a class="site-footer__work-link" href="main-gate-of-the-app.html" data-footer-track="Main Gate of the App">
              <span class="site-footer__work-number">04</span>
              <span class="site-footer__work-copy">
                <span class="site-footer__work-title">Main Gate of the App</span>
                <span class="site-footer__work-cursor" aria-hidden="true">_</span>
              </span>
              <span class="site-footer__work-year">2022</span>
            </a>
          </div>
        </section>
      </div>

      <div class="site-footer__bottom">
        <p class="site-footer__legal">&copy; 2026 &mdash; Derrick Lionardy</p>

        <div class="site-footer__deck">
          <div class="site-footer__cassette" aria-hidden="true">
            <div class="site-footer__cassette-head">Derrick / Vol. 1</div>
            <div class="site-footer__cassette-body">
              <span class="site-footer__cassette-reel"></span>
              <span class="site-footer__cassette-slot"></span>
              <span class="site-footer__cassette-reel"></span>
            </div>
          </div>
          <span class="site-footer__deck-line" aria-hidden="true"></span>
          <p class="site-footer__now-label">// now playing //</p>
          <p class="site-footer__now-title" data-footer-now-playing>DANA Wallet</p>
        </div>

        <nav class="site-footer__socials" aria-label="Social links">
          <a href="#" data-footer-social="x">X</a>
          <a href="#" data-footer-social="instagram">Instagram</a>
          <a href="#" data-footer-social="dribbble">Dribbble</a>
          <a href="#" data-footer-social="linkedin">LinkedIn</a>
        </nav>
      </div>
    </div>
  `;

  const TYPE_DELAY_MS = 34;

  document.querySelectorAll(".site-footer").forEach((footer) => {
    footer.innerHTML = footerMarkup;

    footer.querySelectorAll('[data-footer-social][href="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
      });
    });

    const nowPlaying = footer.querySelector("[data-footer-now-playing]");
    const tracks = Array.from(footer.querySelectorAll(".site-footer__work-link"));
    let typeToken = 0;

    const typeTrack = (title, animate) => {
      typeToken += 1;
      const currentToken = typeToken;

      if (!animate) {
        nowPlaying.textContent = title;
        return;
      }

      nowPlaying.textContent = "";
      let index = 0;

      const step = () => {
        if (currentToken !== typeToken) return;
        nowPlaying.textContent = title.slice(0, index);
        index += 1;

        if (index <= title.length) {
          window.setTimeout(step, TYPE_DELAY_MS);
        }
      };

      step();
    };

    const setActiveTrack = (track, animate) => {
      tracks.forEach((item) => {
        item.classList.toggle("is-active", item === track);
      });

      typeTrack(track.dataset.footerTrack || track.textContent.trim(), animate);
    };

    if (tracks.length) {
      setActiveTrack(tracks[0], false);

      tracks.forEach((track) => {
        track.addEventListener("pointerenter", () => {
          setActiveTrack(track, true);
        });

        track.addEventListener("focus", () => {
          setActiveTrack(track, true);
        });
      });
    }

    footer.dataset.footerReady = "true";
  });
})();
