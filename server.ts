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

dotenv.config({ path: '.env.local' });
dotenv.config(); // fallback to .env if .env.local doesn't exist

// Setup multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

// Database Connection
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/taizer-atass';
  try {
    await mongoose.connect(MONGO_URI, { dbName: 'taizer-atass' });
    console.log(`Connected to MongoDB database: taizer-atass`);
    
    // Seed default admin if it doesn't exist
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: 'password', // in a real app, hash this!
        role: 'admin',
        approved: true
      });
      console.log('Seeded default admin account');
    }
    isConnected = true;
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}

export const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', async (req, res, next) => {
  await connectDB();
  next();
});

  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️ Warning: GEMINI_API_KEY is not set in environment variables.");
  }

  // Serve uploads (bypassed for serverless)
  // app.use('/uploads', express.static('uploads'));

  // --- NEWS API PROXY ---
  let cachedNews: any = null;
  let lastNewsFetch = 0;

  app.get("/api/news", async (req, res) => {
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
  app.post("/api/auth/check-user", async (req, res) => {
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

  app.post("/api/auth/register", async (req, res) => {
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

  app.post("/api/auth/submit-payment", upload.single('receipt'), async (req, res) => {
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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      const user = await User.findOne({ username, password });
      
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
  const onlineUsers = new Map<string, number>();
  
  app.post("/api/heartbeat", (req, res) => {
    const { userId } = req.body;
    if (userId) {
      onlineUsers.set(userId, Date.now());
    }
    res.status(200).send("OK");
  });

  app.get("/api/admin/onlineUsers", authenticateAdmin, (req, res) => {
    try {
      const now = Date.now();
      let activeCount = 0;
      for (const [id, lastSeen] of onlineUsers.entries()) {
        if (now - lastSeen < 15000) { // 15 seconds threshold
          activeCount++;
        } else {
          onlineUsers.delete(id); // cleanup
        }
      }
      res.json({ activeCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/users", authenticateAdmin, async (req, res) => {
    try {
      const users = await User.find().select('-password');
      res.json(users);
    } catch (err: any) {
      console.error("Error fetching users:", err);
      res.status(500).json({ error: "Database error: " + err.message });
    }
  });

  app.post("/api/admin/users/:id/approve", authenticateAdmin, async (req, res) => {
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

  app.get("/api/auth/user-status/:username", async (req, res) => {
    try {
      const user = await User.findOne({ username: req.params.username });
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json({ hasUsedFreeTrial: user.hasUsedFreeTrial || false, approved: user.approved });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/users/:id", authenticateAdmin, async (req, res) => {
    try {
      const user = await User.findByIdAndDelete(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      
      res.json({ message: "User deleted/rejected successfully" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/admin/profile", authenticateAdmin, async (req, res) => {
    try {
      const admin = await User.findById((req as any).admin.id).select('-password');
      if (!admin) return res.status(404).json({ error: "Admin not found" });
      
      res.json(admin);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/admin/profile", authenticateAdmin, async (req, res) => {
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

  app.get("/api/settings", async (req, res) => {
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

  app.post("/api/admin/settings", authenticateAdmin, async (req, res) => {
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
  app.get("/api/binance/klines", async (req, res) => {
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
  app.get("/api/binance/premiumIndex", async (req, res) => {
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
  app.get("/api/binance/openInterest", async (req, res) => {
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
  app.get("/api/binance/depth", async (req, res) => {
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

  



