const form = document.querySelector("#loginForm");
const emailInput = document.querySelector("#loginEmail");
const passwordInput = document.querySelector("#loginPassword");
const alertBox = document.querySelector("#loginAlert");
const resendVerificationLink = document.querySelector("#resendVerificationLink");

function showMessage(message, type = "error") {
  alertBox.textContent = message;
  alertBox.className = `login-alert show ${type}`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("Ingresando...", "info");

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: emailInput.value.trim(),
        password: passwordInput.value
      })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 403) {
        resendVerificationLink.classList.remove("is-hidden");
      }
      throw new Error(payload.error || "No se pudo iniciar sesion.");
    }

    resendVerificationLink.classList.add("is-hidden");
    sessionStorage.setItem("accessToken", payload.accessToken);
    sessionStorage.setItem("authUser", JSON.stringify(payload.user));
    window.location.href = "/";
  } catch (error) {
    showMessage(error.message);
  }
});
