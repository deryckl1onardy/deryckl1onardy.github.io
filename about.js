(function initChatContactForm() {
  const form = document.querySelector(".chat-contact-form");
  if (!form) {
    return;
  }

  const chatThread = document.querySelector(".chat-thread");
  const input = form.querySelector(".chat-message-input");
  const sendButton = form.querySelector(".chat-send");
  const status = document.querySelector("#chat-status");
  const mailShortcut = form.querySelector(".chat-shortcut-mail");
  const socialShortcut = form.querySelector(".chat-shortcut-social");
  const trackProgress = document.querySelector(".track-progress");
  const trackProgressFill = document.querySelector(".track-progress-fill");
  const trackSlider = document.querySelector(".track-slider");
  const trackElapsed = document.querySelector(".track-elapsed");
  const prevButton = document.querySelector(".control-prev");
  const nextButton = document.querySelector(".control-next");
  const pauseButton = document.querySelector(".control-pause");

  const targetEmail = (form.getAttribute("data-target-email") || "").trim();
  const socialUrl = (form.getAttribute("data-social-url") || "").trim();
  const isEmailConfigured =
    targetEmail.length > 0 && !/^you@example\.com$/i.test(targetEmail);

  const STEP_EMAIL = "email";
  const STEP_TOPIC = "topic";
  let currentStep = STEP_EMAIL;
  let visitorEmail = "";
  let isSending = false;

  function formatPlayerTime(totalSeconds) {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutesPart = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secondsPart = String(seconds % 60).padStart(2, "0");
    return `${minutesPart}:${secondsPart}`;
  }

  function syncTrackProgress() {
    if (!trackSlider || !trackProgress || !trackProgressFill) {
      return;
    }

    const min = Number(trackSlider.min) || 0;
    const max = Number(trackSlider.max) || 100;
    const value = Number(trackSlider.value) || 0;
    const pct = ((value - min) / Math.max(1, max - min)) * 100;

    trackProgress.style.setProperty("--progress", `${pct}%`);
    trackProgressFill.style.width = `${pct}%`;

    if (trackElapsed) {
      trackElapsed.textContent = formatPlayerTime(value);
    }
  }

  function triggerControlButtonPress(button) {
    if (!button) {
      return;
    }

    button.classList.remove("is-pressed");
    window.requestAnimationFrame(() => {
      button.classList.add("is-pressed");
    });

    window.setTimeout(() => {
      button.classList.remove("is-pressed");
    }, 180);
  }

  function openPlayStoreLink() {
    const playStoreUrl =
      "https://play.google.com/store/apps/details?id=com.derrer.weatherbutfun&hl=id";

    triggerControlButtonPress(pauseButton);
    const openedWindow = window.open("", "_blank", "noopener,noreferrer");

    window.setTimeout(() => {
      if (openedWindow) {
        openedWindow.location.href = playStoreUrl;
        return;
      }
      window.location.href = playStoreUrl;
    }, 120);
  }

  function setStatus(message, state) {
    if (!status) {
      return;
    }

    status.textContent = message || "";
    if (state) {
      status.setAttribute("data-state", state);
    } else {
      status.removeAttribute("data-state");
    }
  }

  function updateSendAvailability() {
    if (!sendButton || !input) {
      return;
    }

    const hasValue = input.value.trim().length > 0;
    sendButton.disabled = isSending || !hasValue;
    sendButton.classList.toggle("is-ready", !isSending && hasValue);
  }

  function setSending(nextSending) {
    isSending = nextSending;
    form.classList.toggle("is-sending", isSending);
    form.setAttribute("aria-busy", String(isSending));
    updateSendAvailability();
  }

  function buildMailtoUrl(email, message) {
    const subject = encodeURIComponent("New portfolio chat message");
    const lines = [
      `Visitor email: ${email || "-"}`,
      "",
      "Message:",
      message || "",
    ];
    const body = encodeURIComponent(lines.join("\n"));
    return `mailto:${targetEmail}?subject=${subject}&body=${body}`;
  }

  function buildProviderComposeUrl(senderEmail, subjectText, bodyText) {
    const email = (senderEmail || "").trim().toLowerCase();
    const domain = email.includes("@") ? email.split("@")[1] : "";
    const to = encodeURIComponent(targetEmail);
    const subject = encodeURIComponent(subjectText);
    const body = encodeURIComponent(bodyText);

    if (domain === "gmail.com" || domain === "googlemail.com") {
      return `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`;
    }

    if (
      domain === "outlook.com" ||
      domain === "hotmail.com" ||
      domain === "live.com" ||
      domain === "msn.com"
    ) {
      return `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${subject}&body=${body}`;
    }

    if (
      domain === "yahoo.com" ||
      domain === "ymail.com" ||
      domain === "rocketmail.com"
    ) {
      return `https://compose.mail.yahoo.com/?to=${to}&subject=${subject}&body=${body}`;
    }

    return `mailto:${targetEmail}?subject=${subject}&body=${body}`;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
  }

  function scrollChatToLatest() {
    if (!chatThread) {
      return;
    }
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  function addIncomingBubble(text, showName) {
    if (!chatThread || !text) {
      return;
    }

    const row = document.createElement("div");
    row.className = "chat-row chat-row-incoming chat-row-incoming-followup";

    const avatar = document.createElement("div");
    avatar.className = "chat-avatar";
    avatar.setAttribute("aria-hidden", "true");

    const avatarImg = document.createElement("img");
    avatarImg.src = "avatar.svg";
    avatarImg.alt = "";
    avatar.appendChild(avatarImg);

    const bubbleGroup = document.createElement("div");
    bubbleGroup.className = "chat-bubble-group";

    if (showName) {
      const name = document.createElement("span");
      name.className = "chat-name";
      name.textContent = "Derrick";
      bubbleGroup.appendChild(name);
    }

    const bubble = document.createElement("p");
    bubble.className = "chat-bubble chat-bubble-in";
    bubble.textContent = text;
    bubbleGroup.appendChild(bubble);

    row.appendChild(avatar);
    row.appendChild(bubbleGroup);
    chatThread.appendChild(row);
    row.classList.add("is-entering");
    window.setTimeout(() => {
      row.classList.remove("is-entering");
    }, 320);
    scrollChatToLatest();
  }

  function addBubble(text, type) {
    if (!chatThread || !text) {
      return;
    }

    if (type !== "out") {
      addIncomingBubble(text, false);
      return;
    }

    const bubble = document.createElement("p");
    bubble.className = "chat-bubble chat-bubble-out";
    bubble.textContent = text;
    chatThread.appendChild(bubble);
    bubble.classList.add("is-entering");
    window.setTimeout(() => {
      bubble.classList.remove("is-entering");
    }, 320);
    scrollChatToLatest();
  }

  function switchToTopicStep() {
    if (!input) {
      return;
    }

    currentStep = STEP_TOPIC;
    input.value = "";
    input.type = "text";
    input.name = "topic";
    input.placeholder = "";
    input.autocomplete = "off";
    input.minLength = 4;
    input.maxLength = 500;
    input.setAttribute("inputmode", "text");
    input.focus();
    updateSendAvailability();
  }

  function switchToEmailStep() {
    if (!input) {
      return;
    }

    currentStep = STEP_EMAIL;
    visitorEmail = "";
    input.value = "";
    input.type = "email";
    input.name = "email";
    input.placeholder = "";
    input.autocomplete = "email";
    input.minLength = 6;
    input.maxLength = 120;
    input.setAttribute("inputmode", "email");
    updateSendAvailability();
  }

  if (socialShortcut && socialUrl) {
    socialShortcut.setAttribute("href", socialUrl);
  }

  if (mailShortcut) {
    if (!isEmailConfigured) {
      mailShortcut.removeAttribute("href");
      mailShortcut.setAttribute("aria-disabled", "true");
      mailShortcut.setAttribute("tabindex", "-1");
    } else {
      mailShortcut.setAttribute("href", buildMailtoUrl("", ""));
      mailShortcut.addEventListener("click", () => {
        const draftMessage = currentStep === STEP_TOPIC && input ? input.value.trim() : "";
        mailShortcut.setAttribute(
          "href",
          buildMailtoUrl(visitorEmail, draftMessage)
        );
      });
    }
  }

  if (!isEmailConfigured) {
    setStatus(
      "Set your real email in about.html data-target-email to activate this chat form.",
      "warning"
    );
  }

  if (trackSlider) {
    syncTrackProgress();
    trackSlider.addEventListener("input", syncTrackProgress);
  }

  if (pauseButton) {
    pauseButton.addEventListener("click", (event) => {
      event.preventDefault();
      openPlayStoreLink();
    });

    pauseButton.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      openPlayStoreLink();
    });
  }

  [prevButton, nextButton].forEach((button) => {
    if (!button) {
      return;
    }

    button.addEventListener("click", (event) => {
      event.preventDefault();
      triggerControlButtonPress(button);
    });

    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      triggerControlButtonPress(button);
    });
  });

  if (input) {
    input.addEventListener("input", () => {
      updateSendAvailability();
      if (!status || status.getAttribute("data-state") === "warning") {
        return;
      }
      setStatus("", "");
    });
    input.addEventListener("keyup", updateSendAvailability);
    input.addEventListener("change", updateSendAvailability);
  }

  setSending(false);
  switchToEmailStep();
  scrollChatToLatest();

  async function handleSendFlow() {
    if (!input || !isEmailConfigured) {
      setStatus(
        "Set your real email in about.html data-target-email to activate this chat form.",
        "warning"
      );
      return;
    }

    const value = input.value.trim();

    if (currentStep === STEP_EMAIL) {
      if (!isValidEmail(value)) {
        setStatus("Please enter a valid email first.", "error");
        input.focus();
        return;
      }

      visitorEmail = value;
      addBubble(visitorEmail, "out");
      addBubble("Perfect. What do you want to talk about?", "in");
      setStatus("Great, now share your message.", "");
      switchToTopicStep();
      return;
    }

    if (value.length < 4) {
      setStatus("Write at least 4 characters for your message.", "error");
      input.focus();
      return;
    }

    const message = value;
    addBubble(message, "out");
    setSending(true);
    setStatus("Opening your email composer...", "");

    const subjectText = `Portfolio chat message from ${visitorEmail}`;
    const bodyText = [
      `From: ${visitorEmail}`,
      "",
      "Message:",
      message,
    ].join("\n");

    const composeUrl = buildProviderComposeUrl(
      visitorEmail,
      subjectText,
      bodyText
    );

    let openedWindow = null;
    if (composeUrl.startsWith("http")) {
      openedWindow = window.open(composeUrl, "_blank", "noopener,noreferrer");
    }

    if (!openedWindow) {
      window.location.href = buildMailtoUrl(visitorEmail, message);
    }

    addBubble("Composer opened. Press send there and we're done.", "in");
    form.reset();
    setStatus("Draft opened in your email provider.", "success");
    switchToEmailStep();
    setSending(false);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSendFlow();
  });

  if (sendButton) {
    sendButton.addEventListener("click", (event) => {
      event.preventDefault();
      void handleSendFlow();
    });
  }

  if (input) {
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      void handleSendFlow();
    });
  }
})();
