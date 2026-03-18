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

// This function runs EVERY time .save() is called on a User document
userSchema.pre('save', async function (next) {
    if (!this.isModified('passwordHash')) return next(); // <this> is the document about to be saved => returns true only if the document is new or was changed
    const salt = await bcrypt.genSalt(12); // Encrypter - 12 to 24 is current professional standard (2026) and determines the computational cost for the generation of a random unique string
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt); // Combine actual password with salt and apply hashing algorithm => transforms a string of any length to a fixed length (digest)
    next();
});

// Instance method - used in login to match inserted password with existing password in database
userSchema.methods.verifyPassword = async function (passwordAttempt) {
    return bcrypt.compare(passwordAttempt, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);