const form = document.querySelector("#forgotPasswordForm");
const emailInput = document.querySelector("#forgotEmail");
const alertBox = document.querySelector("#forgotAlert");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  alertBox.textContent = "Enviando...";
  alertBox.className = "login-alert show info";

  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailInput.value.trim() })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "No se pudo enviar el enlace.");
    alertBox.textContent = payload.message;
    alertBox.className = "login-alert show success";
  } catch (error) {
    alertBox.textContent = error.message;
    alertBox.className = "login-alert show";
  }
});
