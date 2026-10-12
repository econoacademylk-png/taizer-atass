import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import { User } from "./src/models/User.js";
import { Settings } from "./src/models/Settings.js";
import { WhatsAppSignal } from "./src/models/WhatsAppSignal.js";

dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if .env.local doesn't exist

// Setup multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Database Connection
const ATLAS_URI = 'mongodb://supundilshan358_db_user:ZaAoLY6pOTlsPg5D@ac-h1v7wnr-shard-00-00.ouxm37c.mongodb.net:27017,ac-h1v7wnr-shard-00-01.ouxm37c.mongodb.net:27017,ac-h1v7wnr-shard-00-02.ouxm37c.mongodb.net:27017/taizer-atass?ssl=true&replicaSet=atlas-xaj0ke-shard-0&authSource=admin&appName=Cluster0';

let cachedPromise: Promise<typeof mongoose> | null = null;

async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  if (!cachedPromise) {
    const MONGO_URI = process.env.MONGO_URI || ATLAS_URI;
    cachedPromise = mongoose.connect(MONGO_URI, { 
      dbName: 'taizer-atass',
      serverSelectionTimeoutMS: 8000,
    }).then(async (m) => {
      console.log('Connected to MongoDB database: taizer-atass');
      try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
          await User.create({
            username: 'admin',
            password: 'password',
            role: 'admin',
            approved: true
          });
          console.log('Seeded default admin account');
        }
      } catch (seedErr) {
        console.error('Error checking default admin:', seedErr);
      }
      return m;
    }).catch(err => {
      cachedPromise = null;
      throw err;
    });
  }
  await cachedPromise;
}

export const app = express();
app.use(cors());
app.use(express.json());

export const apiRouter = express.Router();

// Ensure database connection for all API routes
apiRouter.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err: any) {
    console.error('MongoDB connection error:', err);
    res.status(500).json({ error: 'Database connection failed: ' + (err.message || 'unknown error') });
  }
});

// Health / DB Diagnostic Endpoint
apiRouter.get("/health", async (req, res) => {
  try {
    const start = Date.now();
    await connectDB();
    const dbState = mongoose.connection.readyState;
    const usersCount = await User.countDocuments();
    res.json({
      status: "OK",
      database: dbState === 1 ? "Connected" : "Disconnected",
      dbReadyState: dbState,
      usersCount,
      durationMs: Date.now() - start,
      time: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({
      status: "ERROR",
      database: "Connection Failed",
      error: err.message,
      name: err.name,
      time: new Date().toISOString()
    });
  }
});


  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ Warning: GEMINI_API_KEY is not set in environment variables.");
  }

  // Serve uploads (bypassed for serverless)
  // app.use('/uploads', express.static('uploads'));

  // --- NEWS API PROXY ---
  let cachedNews: any = null;
  let lastNewsFetch = 0;

  apiRouter.get("/news", async (req, res) => {
    try {
      if (cachedNews && Date.now() - lastNewsFetch < 3600000) {
        return res.json(cachedNews);
      }
      
      const response = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch news: ${response.status}`);
      }
      
      const data = await response.json();
      cachedNews = data;
      lastNewsFetch = Date.now();
      res.json(data);
    } catch (error) {
      console.error("News fetch error:", error);
      res.status(500).json({ error: "Failed to fetch news" });
    }
  });

  // --- AUTH & ADMIN API ---
  apiRouter.post("/auth/check-user", async (req, res) => {
    try {
      const { username, email } = req.body;
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return res.status(400).json({ error: "Username is already taken" });
      }
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({ error: "Email is already registered" });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post("/auth/register", async (req, res) => {
    try {
      const { username, password, firstName, lastName, email, phone, address, city, postalCode } = req.body;
      if (!username || !password || !email) return res.status(400).json({ error: "Missing required fields" });
      
      const existingUser = await User.findOne({ $or: [{ username }, { email }] });
      if (existingUser) {
        return res.status(400).json({ error: existingUser.email === email ? "Email already exists" : "Username already exists" });
      }
      
      await User.create({ 
        username, password, 
        firstName, lastName, email, phone, address, city, postalCode,
        role: "user", approved: false 
      });
      
      res.json({ message: "Registration successful. Pending admin approval." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post("/auth/submit-payment", upload.single('receipt'), async (req, res) => {
    try {
      const { username, paymentMethod, transactionId, selectedPackage } = req.body;
      if (!username || !selectedPackage) return res.status(400).json({ error: "Missing required fields" });
      if (selectedPackage !== 'Free' && !transactionId) return res.status(400).json({ error: "Missing required transactionId" });
      
      const updateData: any = { paymentMethod, transactionId, selectedPackage, approved: false };
      
      if (req.file) {
        updateData.paymentReceiptUrl = `/uploads/${req.file.filename}`;
      }
      
      const user = await User.findOneAndUpdate(
        { username },
        updateData,
        { new: true }
      );
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      res.json({ message: "Payment details submitted successfully." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post("/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const cleanUsername = (username || '').trim();
      const cleanPassword = (password || '').trim();
      const escaped = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const user = await User.findOne({
        $and: [
          {
            $or: [
              { username: cleanUsername },
              { username: { $regex: new RegExp('^' + escaped + '$', 'i') } },
              { email: { $regex: new RegExp('^' + escaped + '$', 'i') } }
            ]
          },
          {
            $or: [
              { password: password },
              { password: cleanPassword }
            ]
          }
        ]
      });
      
      if (!user) return res.status(401).json({ error: "Invalid credentials" });
      
      if (user.role !== "admin") {
        if (!user.approved) {
          return res.status(403).json({ 
            error: "pending", 
            message: "Account pending approval", 
            username: user.username 
          });
        }
        if (user.expiryDate && new Date(user.expiryDate) < new Date()) {
          return res.status(403).json({ 
            error: "expired", 
            message: "Your subscription has expired. Please contact support.", 
            username: user.username 
          });
        }
      }
      
      const token = jwt.sign(
        { id: user._id, role: user.role }, 
        JWT_SECRET, 
        { expiresIn: user.role === 'admin' ? '30d' : '7d' }
      );
      res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- ADMIN AUTH MIDDLEWARE ---
  const authenticateAdmin = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized: No token provided" });
    }
    const token = authHeader.split(" ")[1];
    try {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }
      req.admin = decoded;
      next();
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
      return res.status(401).json({ error: "Invalid token. Please log in again." });
    }
  };

  // --- ONLINE USERS TRACKING ---
  const onlineUsers = new Map<string, { lastSeen: number, username: string }>();
  
  apiRouter.post("/heartbeat", (req, res) => {
    const { userId, username } = req.body;
    if (userId) {
      onlineUsers.set(userId, { lastSeen: Date.now(), username: username || 'Guest' });
    }
    res.status(200).send("OK");
  });

  apiRouter.get("/admin/onlineUsers", authenticateAdmin, (req, res) => {
    try {
      const now = Date.now();
      let activeCount = 0;
      const usersList: any[] = [];
      for (const [id, data] of onlineUsers.entries()) {
        if (now - data.lastSeen < 15000) { // 15 seconds threshold
          activeCount++;
          usersList.push({ id, username: data.username, lastSeen: data.lastSeen });
        } else {
          onlineUsers.delete(id); // cleanup
        }
      }
      res.json({ activeCount, users: usersList });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- WHATSAPP SIGNALS API ---
  apiRouter.post("/admin/signals", authenticateAdmin, async (req, res) => {
    try {
      const { signalNumber } = req.body;
      const existing = await WhatsAppSignal.findOne({ signalNumber });
      if (existing) {
        Object.assign(existing, req.body);
        existing.updatedAt = new Date();
        await existing.save();
        return res.json(existing);
      }
      const newSignal = new WhatsAppSignal(req.body);
      await newSignal.save();
      res.status(201).json(newSignal);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  apiRouter.get("/admin/signals", authenticateAdmin, async (req, res) => {
    try {
      const signals = await WhatsAppSignal.find().sort({ createdAt: -1 });
      res.json(signals);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.put("/admin/signals/:id", authenticateAdmin, async (req, res) => {
    try {
      const updated = await WhatsAppSignal.findByIdAndUpdate(
        req.params.id, 
        { status: req.body.status, updatedAt: new Date() }, 
        { new: true }
      );
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  apiRouter.delete("/admin/signals/:id", authenticateAdmin, async (req, res) => {
    try {
      await WhatsAppSignal.findByIdAndDelete(req.params.id);
      res.json({ message: "Signal deleted" });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  apiRouter.get("/admin/users", authenticateAdmin, async (req, res) => {
    try {
      const users = await User.find().select('-password');
      res.json(users);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      res.status(500).json({ error: "Database error: " + err.message });
    }
  });

  apiRouter.post("/admin/users/:id/approve", authenticateAdmin, async (req, res) => {
    try {
      const { expiryDate } = req.body;
      if (!expiryDate) return res.status(400).json({ error: "Expiry date is required" });

      const user = await User.findById(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });

      user.approved = true;
      user.expiryDate = new Date(expiryDate);
      if (user.selectedPackage === 'Free') {
        user.hasUsedFreeTrial = true;
      }
      await user.save();
      
      res.json({ message: "User approved" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get("/auth/user-status/:username", async (req, res) => {
    try {
      const user = await User.findOne({ username: req.params.username });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ hasUsedFreeTrial: user.hasUsedFreeTrial || false, approved: user.approved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.delete("/admin/users/:id", authenticateAdmin, async (req, res) => {
    try {
      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      res.json({ message: "User deleted/rejected successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.get("/admin/profile", authenticateAdmin, async (req, res) => {
    try {
      const admin = await User.findById((req as any).admin.id).select('-password');
      if (!admin) return res.status(404).json({ error: "Admin not found" });
      
      res.json(admin);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.put("/admin/profile", authenticateAdmin, async (req, res) => {
    try {
      const { username, email, password } = req.body;
      const updateData: any = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (password) updateData.password = password; // In a real app, hash this!

      const admin = await User.findByIdAndUpdate((req as any).admin.id, updateData, { new: true });
      if (!admin) return res.status(404).json({ error: "Admin not found" });
      
      res.json({ message: "Profile updated successfully" });
    } catch (err: any) {
      if (err.code === 11000) {
        return res.status(400).json({ error: "Username or email is already taken by another user." });
      }
      res.status(400).json({ error: err.message || "Failed to update profile" });
    }
  });

  apiRouter.get("/settings", async (req, res) => {
    try {
      let settings = await Settings.findOne({ settingsId: 'global' });
      if (!settings) {
        settings = await Settings.create({ settingsId: 'global', indicatorsEnabled: true, individualIndicators: {} });
      }
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  apiRouter.post("/admin/settings", authenticateAdmin, async (req, res) => {
    try {
      const settings = await Settings.findOneAndUpdate(
        { settingsId: 'global' },
        { ...req.body },
        { new: true, upsert: true }
      );
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 1. API routes FIRST to prevent Vite routing interceptions

  // Proxy Binance klines
  apiRouter.get("/binance/klines", async (req, res) => {
    try {
      const { symbol, interval, limit } = req.query;
      if (!symbol || !interval) {
        return res.status(400).json({ error: "Missing symbol or interval parameter" });
      }
      
      let url = `https://fapi.binance.com/fapi/v1/klines?symbol=${String(symbol).toUpperCase()}&interval=${String(interval)}&limit=${limit || 1000}`;
      
      // Fallback to Spot API for 1s interval as Futures API doesn't support it
      if (String(interval) === '1s') {
        url = `https://api.binance.com/api/v3/klines?symbol=${String(symbol).toUpperCase()}&interval=1s&limit=${limit || 1000}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch from Binance: ${response.statusText}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy Binance premiumIndex (funding rate data)
  apiRouter.get("/binance/premiumIndex", async (req, res) => {
    try {
      const { symbol } = req.query;
      if (!symbol) {
        return res.status(400).json({ error: "Missing symbol parameter" });
      }

      const url = `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${String(symbol).toUpperCase()}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch premiumIndex: ${response.statusText}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy Binance openInterest
  apiRouter.get("/binance/openInterest", async (req, res) => {
    try {
      const { symbol } = req.query;
      if (!symbol) {
        return res.status(400).json({ error: "Missing symbol parameter" });
      }

      const url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${String(symbol).toUpperCase()}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch openInterest: ${response.statusText}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Proxy Binance depth (order book)
  apiRouter.get("/binance/depth", async (req, res) => {
    try {
      const { symbol, limit } = req.query;
      if (!symbol) {
        return res.status(400).json({ error: "Missing symbol parameter" });
      }

      const url = `https://fapi.binance.com/fapi/v1/depth?symbol=${String(symbol).toUpperCase()}&limit=${limit || 30}`;
      const response = await fetch(url);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch depth: ${response.statusText}` });
      }
      const data = await response.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Mount apiRouter on /api, on Netlify functions path, and at root level
  app.use("/api", apiRouter);
  app.use("/.netlify/functions/api", apiRouter);
  app.use(apiRouter);

  // Local Dev Server start
  if (process.env.NODE_ENV !== 'production') {
    async function startDevServer() {
      const PORT = process.env.PORT || 5000;
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      app.listen(PORT as number, "0.0.0.0", () => {
        console.log(`Local dev server running on http://localhost:${PORT}`);
      });
    }
    startDevServer();
  }
