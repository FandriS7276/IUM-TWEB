/**
 * userSchema.ts — Mongoose schema for registered users of the review platform.
 *
 * Users sign up to write reviews and like movies/reviews. The only distinction
 * between user types is the `top_critic` flag, which mirrors the same field in
 * rottenSchema: regular users and top critics are the same entity — the boolean
 * just marks whether their reviews carry extra weight. Using the same field name
 * means review creation can do `top_critic: req.user.top_critic` directly,
 * with no translation layer needed.
 *
 * Password security — two layers:
 *   1. Bcrypt hashing (pre-save hook): the raw password is hashed before storage,
 *      so even a database admin only sees the digest, not the original password.
 *   2. `select: false` + toJSON transform: the hash field is excluded from every
 *      query and JSON response by default, so it can never leak through the API.
 *      Login code must explicitly opt in: `User.findOne({email}).select('+passwordHash')`.
 */

import { Schema, model, Document } from 'mongoose';
// bcryptjs is used only in this file: for hashing on save and comparing on login
import bcrypt from 'bcryptjs';

// ─── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Plain data shape for a User (no Mongoose methods).
 * Use this when typing lean() results or constructing objects before saving.
 */
export interface IUser {
    email: string;
    username: string;
    /** Bcrypt hash of the password — the raw password is never stored. */
    passwordHash: string;
    /**
     * Top-critic toggle. Same field name as in rottenSchema so that
     * `top_critic: req.user.top_critic` works in review creation without mapping.
     * Defaults to false; flipped to true manually by an admin after verification.
     */
    top_critic: boolean;
    avatar?: string;
    bio?: string;
    /** Set on account creation (defaults to Date.now). */
    joinedAt?: Date;
    /** Updated by the auth layer on every successful login. */
    lastLogin?: Date;
    /** Becomes true once the user confirms their email address. */
    isVerified?: boolean;
    preferences?: {
        darkMode: boolean;
    };
}

/**
 * Full Mongoose document type — adds _id, save(), and custom instance methods
 * on top of the plain IUser shape.
 */
export interface IUserDocument extends IUser, Document {
    /**
     * Compares a plain-text password attempt against the stored bcrypt hash.
     * Returns true on match, false otherwise. Always use this at login —
     * never call bcrypt.compare() directly in controllers.
     */
    verifyPassword(passwordAttempt: string): Promise<boolean>;
    createdAt: Date;
    updatedAt: Date;
}

// ─── Schema definition ───────────────────────────────────────────────────────

const userSchema = new Schema<IUserDocument>(
    {
        email:    { type: String, required: true, unique: true, index: true },
        username: { type: String, required: true, unique: true, index: true },

        passwordHash: {
            type: String,
            required: true,
            // `select: false` excludes this field from every query result by default.
            // A database admin running a query won't see the hash in results unless
            // they explicitly request it. Login code must use .select('+passwordHash').
            select: false
        },

        top_critic: { type: Boolean, default: false },

        avatar: String,
        bio: String,
        joinedAt:   { type: Date, default: Date.now },
        lastLogin:  Date,
        isVerified: { type: Boolean, default: false },
        preferences: {
            darkMode: { type: Boolean, default: false }
        }
    },
    {
        // Automatically manages `createdAt` and `updatedAt` on every save
        timestamps: true,
        // Strip `passwordHash` from all JSON serializations (e.g. res.json(user)).
        // This is a second line of defense: even if select: false is bypassed,
        // the hash will never appear in an API response body.
        toJSON: {
            transform: (_doc, ret) => {
                delete (ret as { passwordHash?: string }).passwordHash;
                return ret;
            }
        }
    }
);

// ─── Pre-save hook: password hashing ────────────────────────────────────────

/**
 * Intercepts every `.save()` call and hashes the password before persistence.
 *
 * Why bcrypt with cost 12?
 *   Bcrypt is purpose-built for passwords: it is intentionally slow and adds
 *   a unique salt per hash. Cost 12 means 2^12 hashing rounds — enough to
 *   make brute-force attacks impractical while staying fast enough for users.
 *
 * Why check `isModified`?
 *   Re-saving a user for unrelated reasons (e.g. updating bio) must NOT
 *   re-hash the already-hashed value — that would corrupt it and lock them out.
 */
userSchema.pre('save', async function (this: IUserDocument) {
    if (!this.isModified('passwordHash')) return;

    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
});

// ─── Instance method ─────────────────────────────────────────────────────────

userSchema.methods.verifyPassword = async function (passwordAttempt: string): Promise<boolean> {
    // bcrypt.compare internally re-derives the salt from the stored hash,
    // so it can compare without ever needing to store the original password
    return bcrypt.compare(passwordAttempt, this.passwordHash);
};

export default model<IUserDocument>('User', userSchema);
