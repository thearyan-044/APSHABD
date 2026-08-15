const form = document.querySelector("#early-access-form");
const successState = document.querySelector("#success-state");
const progressBar = document.querySelector("#progress-bar");
const progressValue = document.querySelector("#progress-value");
const streetField = document.querySelector("#street");
const charCount = document.querySelector("#char-count");
const resetButton = document.querySelector("#reset-form");
const successMessage = document.querySelector("#success-message");
const submitButton = form.querySelector(".submit-button");
const submitButtonWarning = submitButton.querySelector(".button-copy small");
const submitButtonLabel = submitButton.querySelector(".button-copy strong");
const submissionError = document.querySelector("#submission-error");
const accessCodeOutput = document.querySelector("#access-code");
const copyCodeButton = document.querySelector("#copy-code");
const sheetsEndpoint = window.APSHABD_CONFIG?.googleSheetsWebAppUrl?.trim() || "";

const requiredSignals = [
  () => document.querySelector("#name").value.trim().length > 1,
  () => document.querySelector("#email").validity.valid && document.querySelector("#email").value.length > 0,
  () => Boolean(document.querySelector("#city").value),
  () => document.querySelector("#neighbourhood").value.trim().length > 1,
  () => /^[0-9]{6}$/.test(document.querySelector("#pincode").value),
  () => Boolean(form.querySelector('input[name="size"]:checked')),
  () => Boolean(form.querySelector('input[name="fit"]:checked')),
  () => Boolean(form.querySelector('input[name="product"]:checked')),
  () => document.querySelector("#instagram-follow").checked,
  () => document.querySelector("#consent").checked
];

const errorMessages = {
  name: "Give us something to put on the list.",
  email: "A working email helps. Telepathy is still in beta.",
  city: "Pick a city. Neutrality is suspicious.",
  neighbourhood: "Cities are big. Name your actual patch.",
  pincode: "That needs to be a real 6-digit Indian PIN code.",
  size: "Choose the size we'd otherwise sell out of first.",
  fit: "Pick a fit. This is not a personality test.",
  product: "At least pretend you came here for a product.",
  instagramFollow: "Follow @ap.shabd, then confirm it here.",
  consent: "We need permission to send the access link. That's the whole plot."
};

function updateProgress() {
  const complete = requiredSignals.filter((check) => check()).length;
  const percentage = Math.round((complete / requiredSignals.length) * 100);
  progressBar.style.width = `${percentage}%`;
  progressValue.textContent = `${percentage}% CONVINCING`;
}

function setError(name, message = "") {
  const error = document.querySelector(`#${name}-error`);
  if (!error) return;

  error.textContent = message;
  const field = error.closest(".field") || error.closest(".choice-group") || error.parentElement;
  field?.classList.toggle("invalid", Boolean(message));
}

function validateForm() {
  const name = document.querySelector("#name");
  const email = document.querySelector("#email");
  const city = document.querySelector("#city");
  const neighbourhood = document.querySelector("#neighbourhood");
  const pincode = document.querySelector("#pincode");
  const instagramFollow = document.querySelector("#instagram-follow");
  const consent = document.querySelector("#consent");

  const validity = {
    name: name.value.trim().length > 1,
    email: email.validity.valid && email.value.length > 0,
    city: Boolean(city.value),
    neighbourhood: neighbourhood.value.trim().length > 1,
    pincode: /^[0-9]{6}$/.test(pincode.value),
    size: Boolean(form.querySelector('input[name="size"]:checked')),
    fit: Boolean(form.querySelector('input[name="fit"]:checked')),
    product: Boolean(form.querySelector('input[name="product"]:checked')),
    instagramFollow: instagramFollow.checked,
    consent: consent.checked
  };

  Object.entries(validity).forEach(([key, valid]) => {
    setError(key, valid ? "" : errorMessages[key]);
  });

  const firstInvalidKey = Object.keys(validity).find((key) => !validity[key]);
  if (firstInvalidKey) {
    const target = form.querySelector(`#${firstInvalidKey}`) || form.querySelector(`[name="${firstInvalidKey}"]`);
    target?.focus();
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return Object.values(validity).every(Boolean);
}

// No O/0, I/1, S/5, B/8, Z/2 — codes get read off screenshots.
// No vowels either, so a random block can never spell something embarrassing.
const CODE_ALPHABET = "CDFGHJKLMNPQRTVWXY34679";

// Matches the city codes used across the main APSHABD site.
const CITY_TOKENS = {
  Chennai: "MAA",
  Mumbai: "BOM",
  Delhi: "DEL",
  Pune: "PNQ",
  Bangalore: "BLR",
  Kolkata: "CCU",
  Hyderabad: "HYD"
};

function randomBlock(length) {
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);

  let block = "";
  for (let i = 0; i < length; i += 1) {
    block += CODE_ALPHABET[values[i] % CODE_ALPHABET.length];
  }
  return block;
}

function makeAccessCode() {
  const city = document.querySelector("#city").value;
  // ~37 bits of entropy across the two blocks, so codes stay unique in practice.
  return `APS-${CITY_TOKENS[city] || "IND"}-${randomBlock(4)}-${randomBlock(4)}`;
}

function recordPrototypeSubmission(data) {
  const existing = JSON.parse(localStorage.getItem("apshabd-early-access") || "[]");
  existing.push(data);
  localStorage.setItem("apshabd-early-access", JSON.stringify(existing));
}

function buildSubmission(accessCode) {
  const formData = new FormData(form);

  return {
    accessCode,
    name: formData.get("name")?.trim() || "",
    email: formData.get("email")?.trim() || "",
    whatsapp: formData.get("whatsapp")?.trim() || "",
    instagram: formData.get("instagram")?.trim() || "",
    city: formData.get("city") || "",
    neighbourhood: formData.get("neighbourhood")?.trim() || "",
    pincode: formData.get("pincode")?.trim() || "",
    size: formData.get("size") || "",
    fit: formData.get("fit") || "",
    product: formData.getAll("product"),
    street: formData.get("street")?.trim() || "",
    instagramFollow: formData.get("instagramFollow") === "on",
    consent: formData.get("consent") === "on",
    website: formData.get("website") || "",
    sourcePage: window.location.href,
    submittedAt: new Date().toISOString()
  };
}

async function submitToGoogleSheets(data) {
  if (!sheetsEndpoint) {
    if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
      recordPrototypeSubmission(data);
      return "preview";
    }

    throw new Error("The registration list is not connected yet.");
  }

  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(sheetsEndpoint)) {
    throw new Error("The Google Sheets endpoint is misconfigured.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);

  try {
    await fetch(sheetsEndpoint, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(data),
      signal: controller.signal
    });
    return "sent";
  } finally {
    window.clearTimeout(timeout);
  }
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  submitButtonWarning.textContent = isSubmitting ? "SENDING YOUR CASE" : "THIS IS YOUR WARNING";
  submitButtonLabel.textContent = isSubmitting ? "HOLD THE LINE..." : "CLAIM FIRST ACCESS";
}

form.addEventListener("input", (event) => {
  updateProgress();
  submissionError.hidden = true;

  if (event.target.name) {
    setError(event.target.name);
  }

  if (event.target === streetField) {
    charCount.textContent = `${streetField.value.length} / 140`;
  }
});

form.addEventListener("change", (event) => {
  updateProgress();
  if (event.target.name) setError(event.target.name);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validateForm()) return;

  const accessCode = makeAccessCode();
  const submission = buildSubmission(accessCode);

  submissionError.hidden = true;
  setSubmitting(true);

  try {
    const delivery = await submitToGoogleSheets(submission);
    successMessage.textContent = delivery === "preview"
      ? "This local preview saved the test on this device only. Deploy the Apps Script connection before testing the confirmation email."
      : "It's in your inbox too. Open that email and hit “CONFIRM MY ACCESS” or none of this counts.";
    accessCodeOutput.textContent = accessCode;
    resetCopyButton();
    form.hidden = true;
    successState.hidden = false;
    successState.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    submissionError.textContent = error.name === "AbortError"
      ? "The list took too long to answer. Check your connection and try again."
      : `${error.message} Try again before the drop moves on.`;
    submissionError.hidden = false;
    submissionError.scrollIntoView({ behavior: "smooth", block: "center" });
  } finally {
    setSubmitting(false);
  }
});

function resetCopyButton() {
  copyCodeButton.textContent = copyCodeButton.dataset.default;
  copyCodeButton.classList.remove("copied");
}

copyCodeButton.addEventListener("click", async () => {
  const code = accessCodeOutput.textContent.trim();

  try {
    await navigator.clipboard.writeText(code);
    copyCodeButton.textContent = "COPIED";
  } catch (error) {
    // Clipboard access can be blocked; select the code so it can be copied by hand.
    const range = document.createRange();
    range.selectNodeContents(accessCodeOutput);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    copyCodeButton.textContent = "COPY IT MANUALLY";
  }

  copyCodeButton.classList.add("copied");
  window.setTimeout(resetCopyButton, 2600);
});

resetButton.addEventListener("click", () => {
  form.reset();
  form.hidden = false;
  successState.hidden = true;
  charCount.textContent = "0 / 140";
  document.querySelectorAll(".error").forEach((error) => { error.textContent = ""; });
  document.querySelectorAll(".invalid").forEach((field) => field.classList.remove("invalid"));
  submissionError.hidden = true;
  successMessage.textContent = "It's in your inbox too. Open that email and hit “CONFIRM MY ACCESS” or none of this counts.";
  resetCopyButton();
  updateProgress();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#name").focus({ preventScroll: true });
});

updateProgress();
