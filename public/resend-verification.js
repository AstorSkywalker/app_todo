const form = document.querySelector("#resendVerificationForm");
const emailInput = document.querySelector("#resendEmail");
const alertBox = document.querySelector("#resendAlert");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  alertBox.textContent = "Enviando...";
  alertBox.className = "login-alert show info";

  try {
    const response = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value.trim() })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "No se pudo reenviar el enlace.");
    alertBox.textContent = payload.message;
    alertBox.className = "login-alert show success";
  } catch (error) {
    alertBox.textContent = error.message;
    alertBox.className = "login-alert show";
  }
});
