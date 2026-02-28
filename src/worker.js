const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return handleApiRequest(request, env, url);
    }

    return serveStatic(request, env, url);
  }
};

async function handleApiRequest(request, env, url) {
  try {
    if (url.pathname === "/api/medications" && request.method === "GET") {
      return listMedications(env);
    }

    if (url.pathname === "/api/medications" && request.method === "POST") {
      return createMedication(request, env);
    }

    if (url.pathname.startsWith("/api/medications/") && request.method === "DELETE") {
      const id = parsePositiveInt(url.pathname.replace("/api/medications/", ""));
      if (!id) {
        return json({ error: "Invalid medication id." }, 400);
      }
      return deleteMedication(env, id);
    }

    return json({ error: "Not found." }, 404);
  } catch (error) {
    console.error("API error", error);
    return json({ error: "Internal server error." }, 500);
  }
}

async function listMedications(env) {
  const result = await env.medinv.prepare(
    `SELECT
      id,
      name,
      manufacturer,
      active_ingredient AS activeIngredient,
      expiry_date AS expiryDate,
      created_at AS createdAt
    FROM medications
    ORDER BY expiry_date ASC, created_at DESC`
  ).all();

  return json({ items: result.results ?? [] }, 200);
}

async function createMedication(request, env) {
  const body = await safeJson(request);
  if (!body) {
    return json({ error: "Invalid JSON payload." }, 400);
  }

  const name = asText(body.name);
  const manufacturer = asText(body.manufacturer);
  const activeIngredient = asText(body.activeIngredient);
  const expiryDate = normalizeDate(asText(body.expiryDate));

  if (name.length < 2 || name.length > 120) {
    return json({ error: "name must be between 2 and 120 chars." }, 400);
  }
  if (manufacturer.length < 2 || manufacturer.length > 120) {
    return json({ error: "manufacturer must be between 2 and 120 chars." }, 400);
  }
  if (activeIngredient.length < 2 || activeIngredient.length > 160) {
    return json({ error: "activeIngredient must be between 2 and 160 chars." }, 400);
  }
  if (!expiryDate) {
    return json({ error: "expiryDate must be a valid date." }, 400);
  }

  const insert = await env.medinv.prepare(
    `INSERT INTO medications (name, manufacturer, active_ingredient, expiry_date)
     VALUES (?1, ?2, ?3, ?4)`
  )
    .bind(name, manufacturer, activeIngredient, expiryDate)
    .run();

  const id = insert.meta?.last_row_id;
  const created = await env.medinv.prepare(
    `SELECT
      id,
      name,
      manufacturer,
      active_ingredient AS activeIngredient,
      expiry_date AS expiryDate,
      created_at AS createdAt
    FROM medications
    WHERE id = ?1`
  )
    .bind(id)
    .first();

  return json({ item: created }, 201);
}

async function deleteMedication(env, id) {
  const result = await env.medinv.prepare("DELETE FROM medications WHERE id = ?1")
    .bind(id)
    .run();

  if (!result.meta?.changes) {
    return json({ error: "Medication not found." }, 404);
  }
  return json({ ok: true }, 200);
}

async function serveStatic(request, env, url) {
  if (!env.ASSETS || typeof env.ASSETS.fetch !== "function") {
    return new Response("Assets binding not configured.", { status: 500 });
  }

  if ((request.method === "GET" || request.method === "HEAD") && !url.pathname.includes(".")) {
    const indexUrl = new URL(url);
    indexUrl.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
  }

  return env.ASSETS.fetch(request);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS
    }
  });
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return null;
  }
  return parsed;
}

function asText(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function normalizeDate(raw) {
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return isValidIsoDate(raw) ? raw : null;
  }

  const dmy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dmy) {
    const day = Number.parseInt(dmy[1], 10);
    const month = Number.parseInt(dmy[2], 10);
    const year = normalizeYear(Number.parseInt(dmy[3], 10));
    return toIsoDate(day, month, year);
  }

  const my = raw.match(/^(\d{1,2})[./-](\d{2,4})$/);
  if (my) {
    const month = Number.parseInt(my[1], 10);
    const year = normalizeYear(Number.parseInt(my[2], 10));
    if (month < 1 || month > 12 || !year) {
      return null;
    }
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return toIsoDate(lastDay, month, year);
  }

  return null;
}

function normalizeYear(year) {
  if (!Number.isFinite(year)) {
    return null;
  }
  if (year >= 1000 && year <= 9999) {
    return year;
  }
  if (year >= 0 && year <= 99) {
    return 2000 + year;
  }
  return null;
}

function toIsoDate(day, month, year) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function isValidIsoDate(value) {
  const parsed = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parsed) {
    return false;
  }
  return Boolean(
    toIsoDate(
      Number.parseInt(parsed[3], 10),
      Number.parseInt(parsed[2], 10),
      Number.parseInt(parsed[1], 10)
    )
  );
}
