export async function onRequestPost({ request, env }) {
  let d;
  try {
    d = await request.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (d.website) return Response.json({ ok: true });

  const required = ["firstName", "lastName", "email", "company", "country"];
  for (const k of required) {
    if (typeof d[k] !== "string" || !d[k].trim()) {
      return Response.json({ ok: false, error: "missing " + k }, { status: 400 });
    }
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) {
    return Response.json({ ok: false, error: "bad email" }, { status: 400 });
  }

  const text = [
    "**New demo request**",
    "Name: " + d.firstName + " " + d.lastName,
    "Email: " + d.email,
    "Company: " + d.company,
    "Title: " + (d.title || "—"),
    "Phone: " + (d.phone || "—"),
    "Country: " + d.country,
    "Message: " + (d.message || "—"),
  ].join("\n");

  if (env.DEMO_KV) {
    await env.DEMO_KV.put("demo:" + Date.now(), JSON.stringify(d));
  }
  if (env.DISCORD_WEBHOOK) {
    const res = await fetch(env.DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text.slice(0, 1900) }),
    });
    if (!res.ok) {
      console.error("discord forward failed:", res.status);
    }
  }
  return Response.json({ ok: true });
}
