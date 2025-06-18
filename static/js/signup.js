document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signupForm");
  const emailInput = document.getElementById("email");
  const errorDiv = document.getElementById("error");
  const extraWrapper = document.getElementById("extra-fields-wrapper");
  const passwordInput = document.getElementById("password");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const togglePassword = document.getElementById("togglePassword");
  const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");
  const nextBtn = document.getElementById("nextBtn");

  let isFirstStep = true;

  function isValidEmail(email) {
    return /^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email);
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const email = emailInput.value.trim();

    if (isFirstStep) {
      if (isValidEmail(email)) {
        errorDiv.classList.add("hidden");
        extraWrapper.classList.add("show");
        nextBtn.textContent = "Sign Up";
        isFirstStep = false;
      } else {
        errorDiv.classList.remove("hidden");
        extraWrapper.classList.remove("show");
        nextBtn.textContent = "Next";
      }
    } else {
      const username = form.username.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!username || !password || !confirmPassword) {
        alert("Please fill in all fields.");
        return;
      }

      if (password !== confirmPassword) {
        alert("Passwords do not match.");
        return;
      }

      fetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          alert("Account successfully created!");
          window.location.href = "/login";
        } else {
          alert("Error: " + (data.message || "Registration failed."));
        }
      })
      .catch(err => {
        console.error("Error:", err);
        alert("Something went wrong!");
      });
    }
  });

  togglePassword.addEventListener("click", () => {
    const isVisible = passwordInput.type === "text";
    passwordInput.type = isVisible ? "password" : "text";
    togglePassword.src = isVisible
      ? togglePassword.dataset.eyeClosed
      : togglePassword.dataset.eyeOpen;
  });

  toggleConfirmPassword.addEventListener("click", () => {
    const isVisible = confirmPasswordInput.type === "text";
    confirmPasswordInput.type = isVisible ? "password" : "text";
    toggleConfirmPassword.src = isVisible
      ? toggleConfirmPassword.dataset.eyeClosed
      : toggleConfirmPassword.dataset.eyeOpen;
  });
});
