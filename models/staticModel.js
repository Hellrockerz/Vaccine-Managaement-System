const mongoose = require("mongoose");
const schema = require("mongoose").Schema;
const USER = require("../models/userModel")
const bcrypt = require('bcrypt')
const speakeasy = require('speakeasy')
const mongoosePaginate = require('mongoose-paginate-v2');

const staticSchema = new schema(
    {
        type: {
            type: String,
            require: true
        },
        title: {
            type: String,
            require: true
        },
        description: {
            type: String,
            require: true
        },
        status: {
            type: String,
            enum: ["ACTIVE", "DELETED"],
            default: "ACTIVE"
        },
    },
    { timestamps: true }
);
staticSchema.plugin(mongoosePaginate);
const staticModel = mongoose.model("static", staticSchema);
module.exports = staticModel;

async function staticContent() {

    try {
        const staticUserModel = mongoose.model("static", staticSchema);
        const existingContent = await staticUserModel.findOne({
            type: {
                $in: ["Privacy Policy", "Terms And Conditions"]
            }
        });

        if (existingContent) {
            console.log("Static Content Already Exists");
        } else {
            let staticUser1 = {
                status: "ACTIVE",
                type: "Privacy Policy",
                title: "Privacy Policy",
                description: "This is privacy policy",
            };
            let staticUser2 = {
                status: "ACTIVE",
                type: "Terms And Conditions",
                title: "Terms And Conditions",
                description: "This is terms and conditions",
            };
            let staticUser3 = {
                status: "ACTIVE",
                type: "Terms And Conditions",
                title: "Terms And Conditions",
                description: "This is terms and conditions",
            };

            const createdContent = await staticUserModel.create(
                staticUser1,
                staticUser2,
                staticUser3
            );
            console.log("static content created", createdContent);
        }
    } catch (error) {
        console.error("Error:", error);
    }
}
async function createAdmin() {
    try {
        const adminExist = await USER.findOne({ userType: "ADMIN" });
        if (!adminExist) {
            const secret = speakeasy.generateSecret({ length: 20 });
            const passwordHash = await bcrypt.hash("Mobiloiite@1", 10);

            const adminData = new USER({
                firstName: "Mukul",
                lastName: "Gautam",
                username: "mukul8898",
                password: passwordHash,
                email: "mukul@indicchain.com",
                mobileNo: 9599708898,
                location: {
                    coordinates: [parseFloat(78.4378), parseFloat(17.3724)],
                  },
                userType: "ADMIN",
                status: "ACTIVE",
                twoFaStatus: true,
                secretKey: secret.base32,
                permissionsGranted: [],
                OTPVerification: true
            });
            const result = await adminData.save();
            console.log("Admin Createed", result); 
        }else{
            console.log("Admin already Exist")
        }
    } catch (error) {
        console.error("===>>>Error",error);
    }
}

createAdmin();
staticContent();
