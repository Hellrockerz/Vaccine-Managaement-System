const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const aggregatePaginate = require('mongoose-aggregate-paginate-v2')

const userSchema = new mongoose.Schema({
    firstName: {
        type: String,
        required: true,
    },
    lastName: {
        type: String,
        required: true,
    },
    username: {
        type: String,
        required: true,
        
    },
    password: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        default: "",
    },
    mobileNo: {
        type: String,
        required: true,
        default: "",
    },
    location: {
        type: {
            type: String,
            default: 'Point',
            required: true,
        },
        coordinates: {
            type: [Number],
            index: '2dsphere',
        },
    },
    OTP: {
        type: Number,
        default: null
    },    
    OTPVerification: {
        type: Boolean,
        required: true,
        default: false
    },
    expTime: {
        type: Number,
        default: null
    },
    userType: {
        type: String,
        enum: ["ADMIN", "SUBADMIN", "USER"],
        default: "USER",
    },
    status: {
        type: String,
        enum: ["ACTIVE", "BLOCKED", "DELETED",],
        default: "ACTIVE",
    },
    twoFaStatus: {
        type: Boolean,
        required: true,
        default: false
    },
    secretKey:{
        type: String,
        default: null
    },
    permissionGrant:{
        type: Boolean,
        required: false
    },
    permissionsGranted:[{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',   
        required: false   
    }],
},
    {timestamps: true});

userSchema.plugin(mongoosePaginate);
userSchema.plugin(aggregatePaginate);

const User = mongoose.model('User', userSchema);

module.exports = User;

