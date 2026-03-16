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

        avatar: String,
        bio: String,
        joinedAt: { type: Date, default: Date.now },
        lastLogin: Date,
        isVerified: { type: Boolean, default: false },

        preferences: {
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
    }
};


module.exports = mongoose.model('User', userSchema);