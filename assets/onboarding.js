const form = document.querySelector("#onboarding-form");
const steps = [...document.querySelectorAll(".form-step")];
const progress = document.querySelector("#progress-bar");
const progressLabel = document.querySelector("#progress-label");
const message = document.querySelector("#form-message");
const submitButton = document.querySelector("#submit-button");
const token = new URLSearchParams(location.search).get("token") || "";
const localPreview = new URLSearchParams(location.search).get("preview") === "1" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
let currentStep = 0;

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `message show ${type}`;
  message.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateStep(index) {
  currentStep = Math.max(0, Math.min(index, steps.length - 1));
  steps.forEach((step, position) => step.classList.toggle("active", position === currentStep));
  const percentage = ((currentStep + 1) / steps.length) * 100;
  progress.style.width = `${percentage}%`;
  progressLabel.textContent = `Step ${currentStep + 1} of ${steps.length}`;
  message.className = "message";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function validateStep() {
  const controls = [...steps[currentStep].querySelectorAll("input, textarea, select")];
  for (const control of controls) {
    if (!control.checkValidity()) {
      control.reportValidity();
      return false;
    }
  }
  return true;
}

function collectSubmission() {
  const data = new FormData(form);
  const submission = {};
  for (const [key, value] of data.entries()) {
    if (key in submission) {
      submission[key] = Array.isArray(submission[key])
        ? [...submission[key], value]
        : [submission[key], value];
    } else {
      submission[key] = value;
    }
  }
  submission.terms_accepted = data.get("terms_accepted") ? "yes" : "no";
  return submission;
}

document.addEventListener("click", (event) => {
  const next = event.target.closest("[data-next]");
  const previous = event.target.closest("[data-previous]");
  if (next && validateStep()) updateStep(currentStep + 1);
  if (previous) updateStep(currentStep - 1);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateStep()) return;
  submitButton.disabled = true;
  submitButton.textContent = "Sending…";
  try {
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, submission: collectSubmission() }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Submission failed.");
    form.innerHTML = `
      <section class="panel" style="text-align:center">
        <div class="status-icon">✓</div>
        <h2>Thanks — your project brief is in.</h2>
        <p>Ryan will review everything and contact you if anything needs clarification. Your one-week production window starts from this completed submission, subject to any required information being available.</p>
      </section>`;
  } catch (error) {
    showMessage(error.message || "We could not submit the form. Please try again.");
    submitButton.disabled = false;
    submitButton.textContent = "Submit project brief";
  }
});

async function validateLink() {
  if (localPreview) {
    form.elements.business_name.value = "Example Trade Co";
    form.elements.email.value = "owner@example.com";
    showMessage("Local draft preview only - nothing submitted here reaches Stripe or SiteRefresh.", "success");
    return;
  }
  if (!token) {
    form.hidden = true;
    showMessage("This page needs the secure link supplied after your commencement payment.");
    return;
  }
  try {
    const response = await fetch(`/api/onboarding?token=${encodeURIComponent(token)}`);
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Link validation failed.");
    const business = form.elements.business_name;
    const email = form.elements.email;
    if (business && !business.value) business.value = result.business_name || "";
    if (email && !email.value) email.value = result.customer_email || "";
  } catch (error) {
    form.hidden = true;
    showMessage(error.message || "This onboarding link is unavailable.");
  }
}

updateStep(0);
validateLink();
