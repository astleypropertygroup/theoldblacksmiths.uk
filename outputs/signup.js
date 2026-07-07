(function () {
  const forms = document.querySelectorAll("[data-deals-form]");
  const popup = document.querySelector("[data-deals-popup]");
  const popupCloseButtons = document.querySelectorAll("[data-deals-popup-close]");
  const privacyNotice = document.querySelector("[data-privacy-notice]");
  const privacyAccept = document.querySelector("[data-privacy-accept]");
  const popupStorageKey = "oldBlacksmithsDealsPopupClosed";
  const privacyStorageKey = "oldBlacksmithsPrivacyAccepted";

  function closePopup() {
    if (!popup) return;
    popup.hidden = true;
    localStorage.setItem(popupStorageKey, new Date().toISOString());
  }

  function openPopup() {
    if (!popup || localStorage.getItem(popupStorageKey)) return;
    popup.hidden = false;
  }

  if (popup) {
    window.setTimeout(openPopup, 4500);
    popup.addEventListener("click", (event) => {
      if (event.target === popup) closePopup();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !popup.hidden) closePopup();
    });
  }

  popupCloseButtons.forEach((button) => {
    button.addEventListener("click", closePopup);
  });

  if (privacyNotice && !localStorage.getItem(privacyStorageKey)) {
    privacyNotice.hidden = false;
  }

  if (privacyAccept) {
    privacyAccept.addEventListener("click", () => {
      localStorage.setItem(privacyStorageKey, new Date().toISOString());
      if (privacyNotice) privacyNotice.hidden = true;
    });
  }

  forms.forEach((form) => {
    const status = form.querySelector("[data-deals-status]");
    if (!status) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      status.textContent = "Signing you up...";

      const formData = new FormData(form);
      const payload = {
        name: formData.get("name"),
        email: formData.get("email"),
        consent: formData.get("consent") === "on",
      };

      try {
        const response = await fetch("/api/deals-signup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await response.json();
        status.textContent = result.message || "Thanks. You are signed up for future offers.";

        if (response.ok) {
          form.reset();
          localStorage.setItem(popupStorageKey, new Date().toISOString());
          window.setTimeout(() => {
            if (popup && form.closest("[data-deals-popup]")) popup.hidden = true;
          }, 1200);
        }
      } catch (error) {
        status.textContent = "Sorry, the signup could not be saved. Please try again later.";
      }
    });
  });
})();
