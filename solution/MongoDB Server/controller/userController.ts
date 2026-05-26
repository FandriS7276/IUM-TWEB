/**
 * controller/userController.ts — Handles user registration, login, and profile.
 *
 * Three handlers:
 *   register  → POST /user/register — creates a new user with Argon2id hashing
 *   login     → POST /user/login    — verifies credentials and returns a JWT
 *   getProfile → GET /user/profile  — returns the authenticated user's data
 *
 * Password flow:
 *   1. Client sends plain-text password over HTTPS.
 *   2. `register` stores it in `passwordHash` — the pre-save hook in
 *      userSchema.ts automatically hashes it with Argon2id before persistence.
 *   3. `login` uses `user.verifyPassword()` which calls argon2.verify()
 *      internally — the controller never touches raw hashing logic.
 *
 * Token issuance:
 *   Both register and login call `generateTokens()` from config/auth.ts
 *   to produce a signed JWT. The token is returned in the response body —
 *   the frontend stores it in localStorage and attaches it via the Axios
 *   interceptor on subsequent requests.
 */

import { Request, Response } from 'express';
import User from '../schema/userSchema';
import { generateTokens } from '../config/auth';

// ─── POST /user/register ────────────────────────────────────────────────────

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { username, email, password } = req.body as {
            username?: string;
            email?: string;
            password?: string;
        };

        // ── Input validation ────────────────────────────────────────────
        if (!username || !email || !password) {
            res.status(400).json({
                success: false,
                message: 'Username, email, and password are required.',
            });
            return;
        }

        if (password.length < 8) {
            res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters.',
            });
            return;
        }

        // ── Duplicate check ─────────────────────────────────────────────
        const existingUser = await User.findOne({
            $or: [{ email }, { username }],
        });

        if (existingUser) {
            const field = existingUser.email === email ? 'email' : 'username';
            res.status(409).json({
                success: false,
                message: `A user with that ${field} already exists.`,
            });
            return;
        }

        // ── Create user (pre-save hook hashes the password) ─────────────
        const user = new User({
            username,
            email,
            passwordHash: password, // Raw password → hashed by pre-save hook
        });
        await user.save();

        // ── Issue JWT ───────────────────────────────────────────────────
        const token = generateTokens({
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            top_critic: user.top_critic,
        });

        res.status(201).json({
            success: true,
            message: 'Account created successfully.',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                top_critic: user.top_critic,
                avatar: user.avatar,
                bio: user.bio,
            },
        });
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({
            success: false,
            message: 'Registration failed. Please try again.',
        });
    }
};

// ─── POST /user/login ───────────────────────────────────────────────────────

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body as {
            email?: string;
            password?: string;
        };

        if (!email || !password) {
            res.status(400).json({
                success: false,
                message: 'Email and password are required.',
            });
            return;
        }

        // select('+passwordHash') overrides the `select: false` default in the
        // schema — we need the hash here to verify the password attempt
        const user = await User.findOne({ email }).select('+passwordHash');

        if (!user) {
            // Vague message prevents user enumeration attacks
            res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
            return;
        }

        // Use the instance method defined in userSchema.ts
        const isValid = await user.verifyPassword(password);
        if (!isValid) {
            res.status(401).json({
                success: false,
                message: 'Invalid email or password.',
            });
            return;
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        // ── Issue JWT ───────────────────────────────────────────────────
        const token = generateTokens({
            id: user._id.toString(),
            username: user.username,
            email: user.email,
            top_critic: user.top_critic,
        });

        res.status(200).json({
            success: true,
            message: 'Login successful.',
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                top_critic: user.top_critic,
                avatar: user.avatar,
                bio: user.bio,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            message: 'Login failed. Please try again.',
        });
    }
};

// ─── GET /user/profile ──────────────────────────────────────────────────────

export const getProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required.',
            });
            return;
        }

        // Fetch the full user document (minus passwordHash via select: false)
        const user = await User.findById(req.user.id);

        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found.',
            });
            return;
        }

        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                top_critic: user.top_critic,
                avatar: user.avatar,
                bio: user.bio,
                joinedAt: user.joinedAt,
                lastLogin: user.lastLogin,
                preferences: user.preferences,
            },
        });
    } catch (err) {
        console.error('Profile fetch error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to load profile.',
        });
    }
};
