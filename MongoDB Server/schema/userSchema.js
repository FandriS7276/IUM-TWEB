const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, unique: true, index: true },
        username: { type: String, required: true, unique: true, index: true },
        passwordHash: { type: String, required: true },

        role: {
            type: String,
            enum: ['user', 'critic', 'top-critic', 'admin'],
            default: 'user'
        },

        isFollowable: { type: Boolean, default: true },           // ← user can toggle this

        // Counters (kept in sync atomically)
        followersCount: { type: Number, default: 0, index: true },
        followingCount: { type: Number, default: 0 },

        avatar: String,
        bio: String,
        joinedAt: { type: Date, default: Date.now },
        lastLogin: Date,
        isVerified: { type: Boolean, default: false },

        preferences: {
            defaultSort: { type: String, default: 'tomatometer-desc' },
            darkMode: { type: Boolean, default: false }
        }
    },
    {
        timestamps: true
    }
);

userSchema.statics.updateCounter = async function(userId, field, delta) {
    try {
        await this.findByIdAndUpdate(
        userId,
        { $inc: { [field]: delta } },
        { runValidators: true, new: true } // enforce schema rules
        );
    }
    catch (err) {
        console.error(`Failed to update user counter ${field} for user ${userId}:`, err);
        // → here you can add Sentry.captureException(err), Datadog, or your logging service
        // do NOT re-throw — we usually want fire-and-forget for counters
    }
};

// Auto-promote to top-critic when reaching 1000 followers
userSchema.pre('save', function (next) {
    if (this.followersCount >= 1000 && this.role === 'critic') {``
        this.role = 'top-critic';
    }
    next();
});

module.exports = mongoose.model('User', userSchema);