const state = {
  entries: [],
  deferredInstallPrompt: null,
  ocrRunning: false
};

const elements = {
  form: document.querySelector("#entry-form"),
  name: document.querySelector("#name"),
  manufacturer: document.querySelector("#manufacturer"),
  activeIngredient: document.querySelector("#activeIngredient"),
  expiryDate: document.querySelector("#expiryDate"),
  saveButton: document.querySelector("#save-btn"),
  status: document.querySelector("#status-message"),
  reloadButton: document.querySelector("#reload-btn"),
  list: document.querySelector("#inventory-list"),
  emptyState: document.querySelector("#empty-state"),
  photoInput: document.querySelector("#photo-input"),
  photoPreview: document.querySelector("#photo-preview"),
  scanButton: document.querySelector("#scan-photo-btn"),
  ocrStatus: document.querySelector("#ocr-status"),
  ocrText: document.querySelector("#ocr-text"),
  installButton: document.querySelector("#install-btn")
};

init().catch((error) => {
  console.error(error);
  setStatus("Fehler beim Laden der App.");
});

async function init() {
  registerServiceWorker();
  wireEvents();
  await loadEntries();
}

function wireEvents() {
  elements.form?.addEventListener("submit", onSubmitEntry);
  elements.reloadButton?.addEventListener("click", () => loadEntries());
  elements.list?.addEventListener("click", onListClick);
  elements.photoInput?.addEventListener("change", onPhotoSelected);
  elements.scanButton?.addEventListener("click", onScanPhoto);
  elements.installButton?.addEventListener("click", onInstallClicked);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
    elements.installButton?.classList.remove("hidden");
  });
}

async function loadEntries() {
  setStatus("Lade Eintraege...");
  try {
    const response = await fetch("/api/medications");
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unbekannter Fehler.");
    }

    state.entries = payload.items ?? [];
    renderEntries();
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus("Eintraege konnten nicht geladen werden.");
  }
}

async function onSubmitEntry(event) {
  event.preventDefault();

  const payload = {
    name: elements.name?.value.trim() ?? "",
    manufacturer: elements.manufacturer?.value.trim() ?? "",
    activeIngredient: elements.activeIngredient?.value.trim() ?? "",
    expiryDate: elements.expiryDate?.value ?? ""
  };

  if (!payload.name || !payload.manufacturer || !payload.activeIngredient || !payload.expiryDate) {
    setStatus("Bitte alle Felder ausfuellen.");
    return;
  }

  lockForm(true);
  setStatus("Speichere...");
  try {
    const response = await fetch("/api/medications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Speichern fehlgeschlagen.");
    }

    elements.form?.reset();
    setOcrStatus("");
    elements.ocrText.textContent = "";
    elements.photoPreview?.classList.add("hidden");
    await loadEntries();
    setStatus("Eintrag gespeichert.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Speichern fehlgeschlagen.");
  } finally {
    lockForm(false);
  }
}

async function onListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest("[data-delete-id]");
  if (!button) {
    return;
  }

  const id = Number.parseInt(button.getAttribute("data-delete-id"), 10);
  if (!Number.isInteger(id) || id < 1) {
    return;
  }

  if (!window.confirm("Eintrag wirklich loeschen?")) {
    return;
  }

  button.setAttribute("disabled", "true");
  try {
    const response = await fetch(`/api/medications/${id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Loeschen fehlgeschlagen.");
    }
    await loadEntries();
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Loeschen fehlgeschlagen.");
  } finally {
    button.removeAttribute("disabled");
  }
}

function onPhotoSelected() {
  const file = elements.photoInput?.files?.[0];
  if (!file) {
    elements.photoPreview?.classList.add("hidden");
    return;
  }

  const objectUrl = URL.createObjectURL(file);
  if (elements.photoPreview) {
    elements.photoPreview.src = objectUrl;
    elements.photoPreview.classList.remove("hidden");
  }
}

async function onScanPhoto() {
  if (state.ocrRunning) {
    return;
  }

  const file = elements.photoInput?.files?.[0];
  if (!file) {
    setOcrStatus("Bitte zuerst ein Foto auswaehlen.");
    return;
  }

  if (!window.Tesseract || typeof window.Tesseract.recognize !== "function") {
    setOcrStatus("OCR-Bibliothek konnte nicht geladen werden.");
    return;
  }

  state.ocrRunning = true;
  elements.scanButton?.setAttribute("disabled", "true");
  setOcrStatus("Text wird erkannt...");

  try {
    const result = await window.Tesseract.recognize(file, "deu+eng", {
      logger: (message) => {
        if (message.status === "recognizing text" && typeof message.progress === "number") {
          const percent = Math.round(message.progress * 100);
          setOcrStatus(`Text wird erkannt... ${percent}%`);
        }
      }
    });

    const text = result?.data?.text ?? "";
    elements.ocrText.textContent = text.trim() || "Kein Text erkannt.";

    const parsed = parseMedicationText(text);
    applyParsedValues(parsed);

    const foundFields = ["name", "manufacturer", "activeIngredient", "expiryDate"].filter(
      (key) => parsed[key]
    ).length;
    if (foundFields === 0) {
      setOcrStatus("Text erkannt, aber keine klaren Felder gefunden. Bitte manuell ausfuellen.");
      return;
    }
    setOcrStatus(`${foundFields} Feld(er) vorgefuellt. Bitte pruefen und speichern.`);
  } catch (error) {
    console.error(error);
    setOcrStatus("OCR fehlgeschlagen. Bitte Felder manuell ausfuellen.");
  } finally {
    state.ocrRunning = false;
    elements.scanButton?.removeAttribute("disabled");
  }
}

function parseMedicationText(rawText) {
  const text = (rawText || "").replace(/\r/g, "\n");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length >= 2);

  const parsed = {
    name: "",
    manufacturer: "",
    activeIngredient: "",
    expiryDate: ""
  };

  const lowerText = text.toLowerCase();
  const ingredientLabelMatch = text.match(
    /(wirkstoff(?:e)?|active ingredient|inhaltsstoff(?:e)?|substanz)\s*[:\-]?\s*([^\n]+)/i
  );
  if (ingredientLabelMatch?.[2]) {
    parsed.activeIngredient = compact(ingredientLabelMatch[2]);
  }

  if (!parsed.activeIngredient) {
    const ingredientLine = lines.find((line) => /\b\d+([.,]\d+)?\s?(mg|g|ml)\b/i.test(line));
    if (ingredientLine) {
      parsed.activeIngredient = compact(ingredientLine);
    }
  }

  const manufacturerLine = lines.find((line) =>
    /(gmbh|ag|kg|pharma|labor|inc|ltd|s\.a\.|co\.)/i.test(line)
  );
  if (manufacturerLine) {
    parsed.manufacturer = compact(manufacturerLine);
  }

  const nameLine = lines.find((line) => {
    if (!/[a-zA-Z]/.test(line)) return false;
    if (
      /(wirkstoff|exp|mhd|haltbar|lot|charge|hersteller|active ingredient|gmbh|ag|kg)/i.test(
        line
      )
    ) {
      return false;
    }
    return line.length <= 90;
  });
  if (nameLine) {
    parsed.name = compact(nameLine);
  }

  const labelledExpiry = lowerText.match(
    /(?:mhd|exp(?:iry)?|haltbar bis|verwendbar bis)\D{0,12}(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[./-]\d{2,4})/i
  );
  const genericExpiry =
    labelledExpiry?.[1] ||
    text.match(/(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[./-]\d{2,4})/)?.[1] ||
    "";
  parsed.expiryDate = normalizeDateInput(genericExpiry);

  return parsed;
}

function applyParsedValues(values) {
  if (values.name) elements.name.value = values.name;
  if (values.manufacturer) elements.manufacturer.value = values.manufacturer;
  if (values.activeIngredient) elements.activeIngredient.value = values.activeIngredient;
  if (values.expiryDate) elements.expiryDate.value = values.expiryDate;
}

function renderEntries() {
  const entries = state.entries;
  elements.emptyState?.classList.toggle("hidden", entries.length !== 0);
  elements.list.innerHTML = entries.map(renderCard).join("");
}

function renderCard(entry) {
  const expiry = formatDate(entry.expiryDate);
  const expiryBadge = getExpiryBadge(entry.expiryDate);
  return `
    <article class="med-card">
      <div class="med-head">
        <h3 class="med-name">${escapeHtml(entry.name)}</h3>
        <span class="badge ${expiryBadge.className}">${escapeHtml(expiryBadge.label)}</span>
      </div>
      <p class="med-detail"><strong>Hersteller:</strong> ${escapeHtml(entry.manufacturer)}</p>
      <p class="med-detail"><strong>Wirkstoff:</strong> ${escapeHtml(entry.activeIngredient)}</p>
      <p class="med-detail"><strong>Ablauf:</strong> ${escapeHtml(expiry)}</p>
      <button class="danger-btn" type="button" data-delete-id="${entry.id}">Loeschen</button>
    </article>
  `;
}

function getExpiryBadge(isoDate) {
  const expiry = new Date(`${isoDate}T00:00:00`);
  const today = new Date();
  const utcExpiry = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const utcToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((utcExpiry - utcToday) / (1000 * 60 * 60 * 24));

  if (!Number.isFinite(days)) {
    return { label: "Datum unklar", className: "badge-warn" };
  }
  if (days < 0) {
    return { label: "Abgelaufen", className: "badge-danger" };
  }
  if (days <= 60) {
    return { label: `${days} Tage`, className: "badge-warn" };
  }
  return { label: `${days} Tage`, className: "badge-ok" };
}

function formatDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

function setStatus(text) {
  if (elements.status) {
    elements.status.textContent = text;
  }
}

function setOcrStatus(text) {
  if (elements.ocrStatus) {
    elements.ocrStatus.textContent = text;
  }
}

function lockForm(locked) {
  const controls = elements.form?.querySelectorAll("input, button");
  controls?.forEach((control) => {
    if (locked) {
      control.setAttribute("disabled", "true");
    } else {
      control.removeAttribute("disabled");
    }
  });
}

function normalizeDateInput(raw) {
  const value = compact(raw);
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const dmy = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = Number.parseInt(dmy[1], 10);
    const month = Number.parseInt(dmy[2], 10);
    const year = normalizeYear(Number.parseInt(dmy[3], 10));
    return toIsoDate(day, month, year);
  }

  const my = value.match(/^(\d{1,2})[./-](\d{2,4})$/);
  if (my) {
    const month = Number.parseInt(my[1], 10);
    const year = normalizeYear(Number.parseInt(my[2], 10));
    if (!year || month < 1 || month > 12) return "";
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return toIsoDate(lastDay, month, year);
  }

  return "";
}

function normalizeYear(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 1000 && value <= 9999) return value;
  if (value >= 0 && value <= 99) return 2000 + value;
  return null;
}

function toIsoDate(day, month, year) {
  if (!year || day < 1 || day > 31 || month < 1 || month > 12) {
    return "";
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function compact(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

async function onInstallClicked() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  elements.installButton?.classList.add("hidden");
}

