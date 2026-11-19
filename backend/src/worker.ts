import { MongoDBConnection } from "./MongoDBConnection";
import { SignJWT, jwtVerify } from "jose";

interface Env {
  MONGODB_CONNECTION: DurableObjectNamespace<MongoDBConnection>;
  LOGIN_LIMITER: RateLimit;
  MESSAGE_LIMITER: RateLimit;
  ACCESS_PASSWORD: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
}

export { MongoDBConnection };

const COOKIE_NAME = "ow_session";
const SESSION_SECONDS = 8 * 60 * 60;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get("Cookie") || "";

  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) return value.join("=");
  }

  return null;
}

function sessionCookie(token: string) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`;
}

function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function constantTimeEqual(a: string, b: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);

  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);

  for (let i = 0; i < length; i++) {
    difference |= (left[i] || 0) ^ (right[i] || 0);
  }

  return difference === 0;
}

async function authenticate(request: Request, env: Env) {
  const token = getCookie(request, COOKIE_NAME);
  if (!token) return false;

  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.authenticated === true;
  } catch {
    return false;
  }
}

function getDatabase(env: Env) {
  const id = env.MONGODB_CONNECTION.idFromName("openwall-mongodb");
  return env.MONGODB_CONNECTION.get(id);
}

function getClientKey(request: Request) {
  return request.headers.get("CF-Connecting-IP") || "local-development";
}

async function handleRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health" && method === "GET") {
    return json({
      status: "OK",
      application: "OpenWall API",
      platform: "Cloudflare Workers"
    });
  }

  if (path === "/api/db-health" && method === "GET") {
    try {
      return json(await getDatabase(env).ping());
    } catch (error) {
      console.error("Database health check failed:", error);
      return json({ error: "Database connection failed" }, 500);
    }
  }

  if (path === "/api/auth/login" && method === "POST") {
    const rate = await env.LOGIN_LIMITER.limit({
      key: getClientKey(request)
    });

    if (!rate.success) {
      return json({ error: "Too many login attempts. Try again shortly." }, 429);
    }

    let body: { password?: unknown };

    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }

    if (
      typeof body.password !== "string" ||
      body.password.length > 256
    ) {
      return json({ error: "Invalid password" }, 400);
    }

    if (!constantTimeEqual(body.password, env.ACCESS_PASSWORD)) {
      return json({ error: "Incorrect password" }, 401);
    }

    const secret = new TextEncoder().encode(env.JWT_SECRET);

    const token = await new SignJWT({ authenticated: true })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("8h")
      .sign(secret);

    return new Response(
      JSON.stringify({ success: true, message: "Welcome to OpenWall" }),
      {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie(token)
        }
      }
    );
  }

  if (path === "/api/auth/logout" && method === "POST") {
    return new Response(JSON.stringify({ success: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": clearSessionCookie()
      }
    });
  }

  if (path === "/api/auth/me" && method === "GET") {
    if (!(await authenticate(request, env))) {
      return json({ error: "Authentication required" }, 401);
    }

    return json({ authenticated: true });
  }

  if (path === "/api/messages") {
    if (!(await authenticate(request, env))) {
      return json({ error: "Authentication required" }, 401);
    }

    const database = getDatabase(env);

    if (method === "GET") {
      try {
        return json({ messages: await database.listMessages() });
      } catch (error) {
        console.error("Message fetch error:", error);
        return json({ error: "Unable to fetch messages" }, 500);
      }
    }

    if (method === "POST") {
      const rate = await env.MESSAGE_LIMITER.limit({
        key: getClientKey(request)
      });

      if (!rate.success) {
        return json({ error: "Publishing limit reached. Try again shortly." }, 429);
      }

      let body: {
        author?: unknown;
        content?: unknown;
        type?: unknown;
        language?: unknown;
      };

      try {
        body = await request.json();
      } catch {
        return json({ error: "Invalid request body" }, 400);
      }

      if (
        typeof body.content !== "string" ||
        !body.content.trim()
      ) {
        return json({ error: "Message cannot be empty" }, 400);
      }

      if (body.content.length > 20000) {
        return json({ error: "Message is too long" }, 400);
      }

      if (
        body.type !== undefined &&
        body.type !== "text" &&
        body.type !== "code"
      ) {
        return json({ error: "Invalid message type" }, 400);
      }

      if (
        body.author !== undefined &&
        typeof body.author !== "string"
      ) {
        return json({ error: "Invalid author" }, 400);
      }

      if (
        body.language !== undefined &&
        typeof body.language !== "string"
      ) {
        return json({ error: "Invalid language" }, 400);
      }

      try {
        const message = await database.createMessage({
          author: (body.author as string || "").trim().slice(0, 30) || "Anonymous",
          content: body.content.trim(),
          type: (body.type as "text" | "code") || "text",
          language: (body.language as string || "plaintext").slice(0, 30)
        });

        return json({ success: true, message }, 201);
      } catch (error) {
        console.error("Message creation error:", error);
        return json({ error: "Unable to publish message" }, 500);
      }
    }
  }

  return json({ error: "Not found" }, 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");

    // Browser requests must come from the configured frontend.
    if (
      origin &&
      origin !== env.FRONTEND_URL
    ) {
      return json({ error: "Origin not allowed" }, 403);
    }

    // Require an exact origin for browser state-changing requests.
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(request.method) &&
      origin !== env.FRONTEND_URL
    ) {
      return json({ error: "Invalid request origin" }, 403);
    }

    if (request.method === "OPTIONS") {
      if (!origin || origin !== env.FRONTEND_URL) {
        return json({ error: "Origin not allowed" }, 403);
      }

      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": env.FRONTEND_URL,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    const response = await handleRequest(request, env);
    const headers = new Headers(response.headers);

    if (origin === env.FRONTEND_URL) {
      headers.set("Access-Control-Allow-Origin", env.FRONTEND_URL);
      headers.set("Access-Control-Allow-Credentials", "true");
      headers.append("Vary", "Origin");
    }

    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
