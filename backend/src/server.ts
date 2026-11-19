import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { timingSafeEqual } from "node:crypto";

const app = express();

const PORT = Number(process.env.PORT) || 5000;
const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
const FRONTEND_URL = process.env.FRONTEND_URL;

if (!JWT_SECRET || !ACCESS_PASSWORD || !process.env.MONGODB_URI || !FRONTEND_URL) {
  throw new Error("Missing required environment variables");
}

app.use(helmet());

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

function authenticate(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const token = req.cookies?.ow_session;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    jwt.verify(token, JWT_SECRET!);
    next();
  } catch {
    res.clearCookie("ow_session");
    return res.status(401).json({ error: "Session expired" });
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK", application: "OpenWall API" });
});

app.post("/api/auth/login", loginLimiter, (req, res) => {
  const { password } = req.body;

  if (typeof password !== "string" || password.length > 256) {
    return res.status(400).json({ error: "Invalid password" });
  }

  const supplied = Buffer.from(password);
  const expected = Buffer.from(ACCESS_PASSWORD!);

  const valid =
    supplied.length === expected.length &&
    timingSafeEqual(supplied, expected);

  if (!valid) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  const token = jwt.sign(
    { authenticated: true },
    JWT_SECRET!,
    { expiresIn: "8h" }
  );

  res.cookie("ow_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });

  res.json({ success: true, message: "Welcome to OpenWall" });
});

app.get("/api/auth/me", authenticate, (_req, res) => {
  res.json({ authenticated: true });
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("ow_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  });

  res.json({ success: true });
});

app.get("/api/protected", authenticate, (_req, res) => {
  res.json({ message: "You are authenticated!" });
});

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("MongoDB connected successfully");

    app.listen(PORT, () => {
      console.log(`OpenWall API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup failed:", error);
    process.exit(1);
  }
}

startServer();

// Message APIs
import Message from "./config/Message.js";

// Read recent messages
app.get("/api/messages", authenticate, async (_req, res) => {
  try {
    const messages = await Message.find({
      expireAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({ messages });
  } catch (error) {
    console.error("Message fetch error:", error);
    res.status(500).json({ error: "Unable to fetch messages" });
  }
});

// Publish a message
app.post("/api/messages", authenticate, async (req, res) => {
  try {
    const { author, content, type, language } = req.body;

    if (typeof content !== "string" || !content.trim()) {
      return res.status(400).json({ error: "Message cannot be empty" });
    }

    if (content.length > 20000) {
      return res.status(400).json({ error: "Message is too long" });
    }

    if (type !== undefined && !["text", "code"].includes(type)) {
      return res.status(400).json({ error: "Invalid message type" });
    }

    if (author !== undefined && typeof author !== "string") {
      return res.status(400).json({ error: "Invalid author" });
    }

    if (language !== undefined && typeof language !== "string") {
      return res.status(400).json({ error: "Invalid language" });
    }

    const message = await Message.create({
      author: author?.trim().slice(0, 30) || "Anonymous",
      content: content.trim(),
      type: type || "text",
      language: language?.slice(0, 30) || "plaintext",
      expireAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("Message creation error:", error);
    res.status(500).json({ error: "Unable to publish message" });
  }
});
