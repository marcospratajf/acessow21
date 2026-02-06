let cachedToken = null;
let tokenExpiresAt = 0; // timestamp em ms

async function getSendPulseToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 30_000) {
    return cachedToken; // reaproveita (margem de 30s)
  }

  const clientId = process.env.SENDPULSE_CLIENT_ID;
  const clientSecret = process.env.SENDPULSE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Missing SENDPULSE_CLIENT_ID or SENDPULSE_CLIENT_SECRET");
  }

  const resp = await fetch("https://api.sendpulse.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  const json = await resp.json();

  if (!resp.ok) {
    throw new Error(`Token request failed: ${resp.status} ${JSON.stringify(json)}`);
  }

  // Resposta típica: { access_token, token_type, expires_in }
  cachedToken = json.access_token;
  tokenExpiresAt = Date.now() + (Number(json.expires_in || 3600) * 1000);

  return cachedToken;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = req.body;

    // Log pra debug (aparece nos logs da Vercel)
    console.log("HEADERS:", req.headers);
    console.log("PAYLOAD:", JSON.stringify(payload));

    // --- Normaliza phone ---
    const rawPhone =
      payload?.customer?.phone ??
      payload?.phone ??
      payload?.contact?.phone ??
      "";

    let phone = String(rawPhone).replace(/\D/g, "");
    if (!phone) {
      return res.status(400).json({
        ok: false,
        error: "Phone not found in payload"
      });
    }
    if (!phone.startsWith("55")) phone = "55" + phone;

    // garante o caminho customer.phone pro seu mapeamento do SendPulse
    payload.customer = { ...(payload.customer || {}), phone };

    // --- Envia pro SendPulse com Authorization ---
    const sendpulseUrl = process.env.SENDPULSE_EVENT_URL;
    if (!sendpulseUrl) {
      return res.status(500).json({ ok: false, error: "Missing SENDPULSE_EVENT_URL env var" });
    }

    const token = await getSendPulseToken();

    const spResp = await fetch(sendpulseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const spText = await spResp.text();

    if (!spResp.ok) {
      return res.status(502).json({
        ok: false,
        error: "SendPulse request failed",
        status: spResp.status,
        body: spText
      });
    }

    return res.status(200).json({ ok: true, normalized_phone: phone });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}
