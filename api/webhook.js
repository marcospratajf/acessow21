export default async function handler(req, res) {
  // Só aceita POST
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const payload = req.body;
    console.log("HEADERS:", req.headers);
    console.log("PAYLOAD:", JSON.stringify(payload));


    // Tenta achar o phone nos formatos mais comuns
    const rawPhone =
      payload?.customer?.phone ??
      payload?.phone ??
      payload?.contact?.phone ??
      "";

    // Normaliza: só dígitos
    let phone = String(rawPhone).replace(/\D/g, "");

    // Se vier vazio, devolve erro claro (pra você enxergar no log)
    if (!phone) {
      return res.status(400).json({
        ok: false,
        error: "Phone not found in payload",
        receivedKeys: Object.keys(payload || {})
      });
    }

    // Se não começar com 55, adiciona
    if (!phone.startsWith("55")) {
      phone = "+55" + phone;
    }

    // Coloca de volta no lugar esperado pelo seu mapeamento no SendPulse
    if (payload?.customer && typeof payload.customer === "object") {
      payload.customer.phone = phone;
    } else {
      // garante customer pra manter seu mapeamento ${['customer']['phone']}
      payload.customer = { ...(payload.customer || {}), phone };
    }

    // URL do SendPulse (configure como variável de ambiente)
   const sendpulseUrl = process.env.SENDPULSE_EVENT_URL;
const token = process.env.SENDPULSE_TOKEN;

const headers = { "Content-Type": "application/json" };

// Se tiver token, manda no header (formato comum)
if (token) {
  headers["Authorization"] = `Bearer ${token}`;
}

const spResp = await fetch(sendpulseUrl, {
  method: "POST",
  headers,
  body: JSON.stringify(payload)
});


    const spText = await spResp.text();

    // Se o SendPulse der erro, você vê aqui
    if (!spResp.ok) {
      return res.status(502).json({
        ok: false,
        error: "SendPulse request failed",
        status: spResp.status,
        body: spText
      });
    }

    // OK
    return res.status(200).json({
      ok: true,
      normalized_phone: phone
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || "Unknown error"
    });
  }
}


