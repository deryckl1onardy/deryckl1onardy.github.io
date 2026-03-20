const links = document.querySelectorAll(".nav-link");

function setActiveFromHash() {
  const hash = window.location.hash || "#home";
  links.forEach((link) => {
    link.classList.toggle("is-active", link.getAttribute("href") === hash);
  });
}

links.forEach((link) => {
  link.addEventListener("click", () => {
    links.forEach((item) => item.classList.remove("is-active"));
    link.classList.add("is-active");
  });
});

window.addEventListener("hashchange", setActiveFromHash);
setActiveFromHash();

const canUsePointerTilt =
  window.matchMedia("(prefers-reduced-motion: no-preference)").matches &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

if (canUsePointerTilt) {
  const cassettes = document.querySelectorAll(".project-item .mixtape");
  const maxTiltX = 4;
  const maxTiltY = 4;

  function updateCassetteTilt(event) {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
      return;
    }

    const cassette = event.currentTarget;
    const rect = cassette.getBoundingClientRect();
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    const normalizedX = Math.max(-1, Math.min(1, (relativeX - 0.5) * 2));
    const normalizedY = Math.max(-1, Math.min(1, (relativeY - 0.5) * 2));
    const tiltX = -normalizedY * maxTiltX;
    const tiltY = normalizedX * maxTiltY;
    const farX = normalizedX * 0.8;
    const farY = normalizedY * 0.8;
    const midX = normalizedX * 1.4;
    const midY = normalizedY * 1.4;
    const nearX = normalizedX * 2.2;
    const nearY = normalizedY * 2.2;
    const lightX = normalizedX * 16;
    const lightY = normalizedY * 14;

    cassette.style.setProperty("--mixtape-tilt-x", `${tiltX.toFixed(2)}deg`);
    cassette.style.setProperty("--mixtape-tilt-y", `${tiltY.toFixed(2)}deg`);
    cassette.style.setProperty("--mixtape-parallax-far-x", `${farX.toFixed(2)}px`);
    cassette.style.setProperty("--mixtape-parallax-far-y", `${farY.toFixed(2)}px`);
    cassette.style.setProperty("--mixtape-parallax-mid-x", `${midX.toFixed(2)}px`);
    cassette.style.setProperty("--mixtape-parallax-mid-y", `${midY.toFixed(2)}px`);
    cassette.style.setProperty("--mixtape-parallax-near-x", `${nearX.toFixed(2)}px`);
    cassette.style.setProperty("--mixtape-parallax-near-y", `${nearY.toFixed(2)}px`);
    cassette.style.setProperty("--mixtape-light-x", `${lightX.toFixed(2)}%`);
    cassette.style.setProperty("--mixtape-light-y", `${lightY.toFixed(2)}%`);
  }

  function resetCassetteTilt(event) {
    const cassette = event.currentTarget;
    cassette.classList.remove("is-tilting");
    cassette.style.setProperty("--mixtape-tilt-x", "0deg");
    cassette.style.setProperty("--mixtape-tilt-y", "0deg");
    cassette.style.setProperty("--mixtape-parallax-far-x", "0px");
    cassette.style.setProperty("--mixtape-parallax-far-y", "0px");
    cassette.style.setProperty("--mixtape-parallax-mid-x", "0px");
    cassette.style.setProperty("--mixtape-parallax-mid-y", "0px");
    cassette.style.setProperty("--mixtape-parallax-near-x", "0px");
    cassette.style.setProperty("--mixtape-parallax-near-y", "0px");
    cassette.style.setProperty("--mixtape-light-x", "0%");
    cassette.style.setProperty("--mixtape-light-y", "0%");
  }

  cassettes.forEach((cassette) => {
    cassette.addEventListener("pointerenter", () => {
      cassette.classList.add("is-tilting");
    });
    cassette.addEventListener("pointermove", updateCassetteTilt);
    cassette.addEventListener("pointerleave", resetCassetteTilt);
    cassette.addEventListener("pointercancel", resetCassetteTilt);
  });

  const avatar = document.querySelector(".hero-avatar");

  if (avatar) {
    let blinkTimer;

    function updateAvatarTiltFromPointer(clientX, clientY) {
      const rect = avatar.getBoundingClientRect();
      const avatarCenterX = rect.left + rect.width / 2;
      const avatarCenterY = rect.top + rect.height / 2;
      const normalizedX = Math.max(-1, Math.min(1, (clientX - avatarCenterX) / (rect.width / 2)));
      const normalizedY = Math.max(-1, Math.min(1, (clientY - avatarCenterY) / (rect.height / 2)));
      const tiltX = -normalizedY * 1.8;
      const tiltY = normalizedX * 1.8;
      const parallaxX = normalizedX * 0.9;
      const parallaxY = normalizedY * 1.1;
      const lightX = normalizedX * 14;
      const lightY = normalizedY * 12;

      avatar.style.setProperty("--avatar-x", normalizedX.toFixed(3));
      avatar.style.setProperty("--avatar-y", normalizedY.toFixed(3));
      avatar.style.setProperty("--avatar-tilt-x", `${tiltX.toFixed(2)}deg`);
      avatar.style.setProperty("--avatar-tilt-y", `${tiltY.toFixed(2)}deg`);
      avatar.style.setProperty("--avatar-parallax-x", `${parallaxX.toFixed(2)}px`);
      avatar.style.setProperty("--avatar-parallax-y", `${parallaxY.toFixed(2)}px`);
      avatar.style.setProperty("--avatar-light-x", `${lightX.toFixed(2)}%`);
      avatar.style.setProperty("--avatar-light-y", `${lightY.toFixed(2)}%`);
    }

    function updateAvatarTilt(event) {
      if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") {
        return;
      }
      updateAvatarTiltFromPointer(event.clientX, event.clientY);
    }

    function resetAvatarTilt() {
      avatar.style.setProperty("--avatar-x", "0");
      avatar.style.setProperty("--avatar-y", "0");
      avatar.style.setProperty("--avatar-tilt-x", "0deg");
      avatar.style.setProperty("--avatar-tilt-y", "0deg");
      avatar.style.setProperty("--avatar-parallax-x", "0px");
      avatar.style.setProperty("--avatar-parallax-y", "0px");
      avatar.style.setProperty("--avatar-light-x", "0%");
      avatar.style.setProperty("--avatar-light-y", "0%");
    }

    function blinkOnLeftClick(event) {
      if (event.button !== 0) {
        return;
      }

      avatar.classList.remove("is-blinking");
      void avatar.offsetWidth;
      avatar.classList.add("is-blinking");

      clearTimeout(blinkTimer);
      blinkTimer = setTimeout(() => {
        avatar.classList.remove("is-blinking");
      }, 120);
    }

    document.addEventListener("pointermove", updateAvatarTilt);
    window.addEventListener("pointerleave", resetAvatarTilt);
    window.addEventListener("blur", resetAvatarTilt);
    document.addEventListener("mousedown", blinkOnLeftClick);
  }
}
