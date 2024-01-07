const tokenGenerator = require("../auth/auth").tokenGenerator;
const express = require('express');

const User = require("../models/userModel");
const Centre = require("../models/centreModel");
const Order = require("../models/orderModel");
const common = require("../helper/common");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const Razorpay = require("razorpay");
const RAZORPAY_ID_KEY = "rzp_test_WPuv6RsjVAOiGv";
const RAZORPAY_SECRET_KEY = "kELRmLUimTDEGgAcNj9LoIV0";
const razorpayWebhookSecret = "hello";

const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const cors = require('cors');

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const razorpay = new Razorpay({
  key_id: RAZORPAY_ID_KEY,
  key_secret: RAZORPAY_SECRET_KEY,
});

async function signup(req, res) {
  const { firstName, lastName, email, password, cPassword, mobileNo, longitude, latitude } = req.body;

  if (![firstName, lastName, email, password, cPassword, mobileNo, longitude, latitude].every(Boolean)) {
    return res.status(405).json({ error: "All Fields Are Required" });
  }

  const m = mobileNo.toString();
  const username = firstName.toLowerCase() + m.slice(-4);
  const otp = common.generateOTP();
  const OTPTime = Date.now() + 5 * 60 * 1000;
  const subject = "OTP Verification for signup";
  const text = `Your OTP is: ${otp}.`;

  try {
    const data = await User.findOne({ $or: [{ email: email }, { mobileNo: mobileNo }], status: "ACTIVE" });

    if (data && data.OTPVerification === true) {

      if (data.mobileNo == mobileNo && data.email !== email) {
        return res.status(402).json({ message: "Number Already In Use." })
      }

      else if (data.email == email && data.mobileNo != mobileNo) {
        return res.status(401).json({ message: "Email Already In Use." })
      }

      else { return res.status(402).json({ message: "User Already Exists." }) }
    }

    if (data && password !== cPassword) {
      return res.status(data ? 403 : 405).json({ message: "Password and Confirm Password must be the same" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userToUpdate = data || new User();

    Object.assign(userToUpdate, {
      firstName,
      lastName,
      username,
      password: hashedPassword,
      email,
      mobileNo,
      location: {
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
        type: "Point",
      },
      OTP: otp,
      expTime: OTPTime
    });

    const updatedUser = await userToUpdate.save();
    await common.sendMail(email, subject, text);

    return res.status(data ? 201 : 200).json({
      message: "Signed Up Successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function resendOTP(req, res) {
  try {
    const { emailOrMobileNo } = req.body

    const newOTP = common.generateOTP();
    const expTime = Date.now() + 5 * 60 * 1000;

    const user = await User.findOne({ $or: [{ email: emailOrMobileNo }, { mobileNo: emailOrMobileNo }], status: "ACTIVE" });

    if (!user) {
      return res.status(404).json({ message: "User is not Signed Up" });
    }

    const update = await User.findByIdAndUpdate(
      { _id: user._id },
      { $set: { expTime: expTime, OTP: newOTP } },
      { new: true }
    );

    if (!update) {
      return res.status(405).json({ message: "User Not Found" })
    }

    else {
      let subject = `New OTP`;
      let text = `Your new OTP is :${newOTP}`;

      await common.sendMail(user.email, subject, text);
      return res.status(201).json({ message: "OTP resent succesfully", "New OTP": newOTP })
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function forgotPassword(req, res) {

  try {
    const { emailOrMobileNo } = req.body;

    if (!emailOrMobileNo) {
      return res.status(404).json({ message: "Please Enter Email or Mobile Number" })
    }

    const newOTP = common.generateOTP();
    const expTime = Date.now() + 5 * 60 * 1000;
    const subject = "Forgot Password OTP";
    const text = `Your forgot password OTP is ${newOTP}`;

    const user = await User.findOne({ $or: [{ email: emailOrMobileNo }, { mobileNo: emailOrMobileNo }], status: "ACTIVE" });

    if (!user) {
      return res.status(404).json({ message: "User is not Signed Up" });
    }

    await User.findByIdAndUpdate(
      { _id: user._id },
      { $set: { expTime: expTime, OTP: newOTP } },
      { new: true }
    );

    await common.sendMail(user.email, subject, text);
    return res.status(200).json({ message: "OTP Sent Succesfully.", "Your new OTP is": newOTP });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function verifyOTP(req, res) {
  const { emailOrMobileNo, otp } = req.body;

  if (!emailOrMobileNo) {
    return res.status(404).json({ message: "Please Enter Email or Mobile Number" });
  }

  try {
    const user = await User.findOne({ $or: [{ email: emailOrMobileNo }, { mobileNo: emailOrMobileNo }], status: "ACTIVE" });

    if (!user) {
      return res.status(404).json({ message: "User is not Signed Up" });
    }

    const currentTime = Date.now();

    if (currentTime <= user.expTime) {

      if (otp === user.OTP) {

         await User.findOneAndUpdate(
          { _id: user._id, status: "ACTIVE" },
          { $set: { OTPVerification: true } },
          { new: true }
        );

        const message = "OTP Verified Successfully"
        return tokenGenerator(res, data, message)

      } else {
        return res.status(201).json({ message: "Entered Wrong OTP" });
      }
    } else {
      return res.status(202).json({ message: "OTP timed out" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function updatePassword(req, res) {
  // require token new Password and confrim password, (otp will be verified by verifyOTP)
  const Id = req.user.id;

  try {
    const { newPassword, confirmPasword } = req.body;

    const data = await User.findOne({ _id: Id, status: "ACTIVE" });
    // const data = await User.findOne({ $or: [{ email: emailOrMobileNo }, { mobileNo: emailOrMobileNo }], status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User not found" });

    } else {
      if (data.OTPVerification === true) {
        if (newPassword == confirmPasword) {

          await User.findByIdAndUpdate(
            { _id: data._id },
            { $set: { password: bcrypt.hashSync(newPassword, 10) } },
            { new: true }
          );
          const message = "Password Updated Succesfully."
          return tokenGenerator( res, data, message )

        } else {
          return res.status(405).json({ message: "New and Confirm Password Must Be Same." });
        }
      } else {
        return res.status(402).json({ message: "OTP not verified" });
      }
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function resetPassword(req, res) {
  // require old password, newPassword
  const Id = req.user.id;

  const { oldPassword, newPassword, confirmPasword } = req.body;
  try {
    const data = await User.findOne({ _id: Id, status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User not found" })
    }

    // const match = await bcrypt.compare(oldPassword, data.password);

    if (bcrypt.compareSync(oldPassword, data.password) === true) {

      if (newPassword != confirmPasword) {
        return res.status(405).json({ message: "New and Confirm Password Must Be Same." })
      }

      const newHashedPassword = await bcrypt.hash(newPassword, 10);

      await User.findOneAndUpdate(
        { _id: data._id, status: "ACTIVE" },
        { $set: { password: newHashedPassword } },
        { new: true }
      );

      return res.status(200).json({ message: "Password Changed Succesfully" });

    } else {
      return res.status(406).json({ message: "Enter correct old password" });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getUserProfile(req, res) {

  const Id = req.user.id;
  try {
    const data = await User.findOne({ _id: Id, status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User not found" })
    }

    return res.status(200).json({ message: "Users Fetched Successfully", user: data });

  } catch (error) {
    console.error("Error fetching user profile:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

async function updateEmail(req, res) {

  const Id = req.user.id;
  const { newEmail } = req.body;

  try {
    const data = await User.findOne({ _id: Id, status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User not found" })
    }

    const user = await User.findOne({ email: newEmail , status: "ACTIVE" });

    if (!user) {
      return res.status(404).json({ message: "Email already in use" })
    }

    else {
      await User.findOneAndUpdate(
        { _id: data._id, status: "ACTIVE" },
        { $set: { newEmail: newEmail, OTPVerification: false, } },
        { new: true }
      );
      return res.status(201).json({ message: "Email Updated Successfully" });

    }
  } catch (error) {
    console.error("Error updating email:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

async function deleteAccount(req, res) {

  const Id = req.user.id;

  try {
    const data = await User.findOne({ _id: Id, status: "ACTIVE" });
    if (data) {

      await User.findOneAndUpdate(
        { _id: data._id },
        { $set: { status: "DELETED" } },
        { new: true }
      );

      return res.status(201).json({ message: "Account Deleted Successfully" });

    } else {
      return res.status(402).json({ message: "User not found" });
    }
  } catch (error) {
    return res.status(500).json({ message: "Internal Server Error" });
  }
}

async function login(req, res) {
  try {
    const { emailOrMobileNo, password} = req.body;

    const user = await User.findOne({ $or: [{ email: emailOrMobileNo }, { mobileNo: emailOrMobileNo }], status: "ACTIVE" });

    console.log(user)

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.OTPVerification === false) {
      return res.status(401).json({ message: "OTP not verified. Cannot log in." });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (isPasswordCorrect === true) {

      if (user.twoFaStatus === false) {
        return tokenGenerator(res, user)
      }

      else {
        return res.status(401).json({ message: "Your 2FA is enabled" })
      }
    }
    return res.status(404).json({ message: "Incorrect Password" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function twoFAVerfication(req, res) {

  try {

    const { emailOrMobileNo, otp } = req.body;

    const user = await User.findOne({ $or: [{ email: emailOrMobileNo }, { mobileNo: emailOrMobileNo }], status: "ACTIVE" });

    console.log(user)

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.OTPVerification === false) {
      return res.status(401).json({ message: "OTP not verified. Cannot log in." });
    }

    if (user.twoFaStatus === false) {
      return tokenGenerator(res, user);
    }

    if (!otp) {
      return res.status(411).json({ message: "Enter the OTP for Two FA" });
    }

    const verification = speakeasy.totp.verify({
      secret: user.secretKey,
      encoding: "base32",
      token: otp,
      window: 2,
    });

    if (verification) {
      return tokenGenerator(res, user);

    } else {
      return res.status(401).json({ message: "Invalid OTP" });
    }

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }

}

async function updateUserProfile(req, res) {

  const Id = req.user.id;
  const { firstName, lastName, /*oldpassword, newPassword, cNewPassword,*/ longitude, latitude } = req.body;

  try {
    const data = await User.findOne({ _id: Id, status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User not found" });
    }

    if (firstName) { data.firstName = firstName; }
    if (lastName) { data.lastName = lastName; }

    // if (oldpassword && newPassword && cNewPassword) {
    //   const isPasswordMatch = await bcrypt.compare(oldpassword, data.password);

    //   if (!isPasswordMatch) {
    //     return res.status(401).json({ message: "Current password is incorrect" });
    //   }

    //   if (newPassword !== cNewPassword) {
    //     return res.status(403).json({ message: "New password and confirm password must be the same" });
    //   }

    //   const hashedPassword = await bcrypt.hash(newPassword, 10);
    //   data.password = hashedPassword;
    // }

    if (longitude && latitude) {
      data.location = { coordinates: [parseFloat(longitude), parseFloat(latitude)] };
    }

    const updatedUser = await data.save();

    return res.status(200).json({ message: "User profile updated successfully", data: updatedUser });
  } catch (error) {
    console.error("Error updating user profile:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function getUserList(req, res) {
  try {
    const userId = req.user.id;

    const data = await User.findOne({ _id: userId, userType: "ADMIN", status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User does not Exist" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const pipeline = [
      { $match: { status: "ACTIVE" } },
      {
        $project: {
          _id: 1,
          username: 1,
          email: 1,
          userType: 1,
          status: 1,
        },
      },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    const result = await User.aggregatePaginate(User.aggregate(pipeline));

    const pageInfo = {
      total: result.totalDocs,
      currentPage: result.page,
      perPage: result.limit,
      totalPages: result.totalPages,
    };

    return res.status(200).json({ message: result.docs, pageInfo });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
}

async function createSubAdmin(req, res) {
  try {

    const adminId = req.user.id;

    const { firstName, lastName, email, mobileNo, password, longitude, latitude } = req.body;

    if (!firstName || !lastName || !email || !mobileNo || !password || !longitude || !latitude) {
      return res.status(401).json({ message: "All fields are required" });
    }

    const admin = await User.findOne({ _id: adminId, userType: { $in: ["ADMIN", "SUBADMIN"] }, status: "ACTIVE" })

    if (!admin) {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" })
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const isSubadmin = await User.findOne({ $or: [{ email: email }, { mobileNo: mobileNo }], status: "ACTIVE" })

    if (isSubadmin) {
      return res.status(402).json({ message: `USER Already Exist as ${isSubadmin.userType}` });
    }

    if (admin || admin.permissionGrant) {
      const m = mobileNo.toString();
      const username = firstName.toLowerCase() + m.slice(-4);
      const subject = "Vaccination Management System";
      const text = `You have been appointed as SubAdmin\nBelow are your credentials.\nNEVER SHARE YOUR CREDENTIALS WITH ANYONE\n email:${email}\nmobileNo:${mobileNo}\npassword:${password}`;

      const subAdmin = new User({
        firstName,
        lastName,
        username,
        password: hashedPassword,
        OTPVerification: true,
        email,
        mobileNo,
        location: {
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
        userType: "SUBADMIN",
        permissionGrant: false,
      });

      const newSubAdmin = await subAdmin.save();

      await common.sendMail(email, subject, text);

      return res.status(200).json({ message: "Sub Admin created successfully and they have been notified through email", newSubAdmin, });
    }
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteSubAdmin(req, res) {
  try {

    const userId = req.user.id;

    const userData = await User.findOne({ _id: userId, userType: { $in: ["ADMIN", "SUBADMIN"] }, status: "ACTIVE" })

    const { subAdminid } = req.body;

    if (!userData) {
      return res.status(404).json({ error: "User Not Found" });
    }

    if (!(userData || userData.permissionGrant)) {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }

    if (!subAdminid) {
      return res.status(400).json({ error: "subAdminid is required" });
    }

    const subAdminData = await User.findOne({ _id: subAdminid, userType: "SUBADMIN", status: "ACTIVE" })

    if (!subAdminData) {
      return res.status(404).json({ error: "SUBADMIN Not Found" });
    }

    const deletedSubAdmin = await User.findByIdAndUpdate(
      { _id: subAdminid },
      { $set: { status: "DELETED" } },
      { new: true }
    );

    return res.status(200).json({ message: "Subadmin deleted successfully", deletedSubAdmin })

  } catch (error) {
    console.error("Error deleting subadmin:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function permissionGranting(req, res) {
  try {
    const userId = req.user.id;
    const { _idorUsername } = req.body;

    const user = await User.findOne({ _id: userId, userType: "ADMIN", status: "ACTIVE" })

    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }

    if (user.userType !== "ADMIN") {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }

    const subAdmin = await User.findOne({ $or: [{ _id: _idorUsername }, { username: _idorUsername }], userType: "SUBADMIN", status: "ACTIVE" });

    if (!subAdmin) {
      return res.status(404).json({ message: "SubAdmin Not Found" });
    }

    subAdmin.permissionGrant = true;
    await subAdmin.save();

    const pushUser = await User.findOneAndUpdate(
      { userType: user._id },
      { $addToSet: { permissionsGranted: subAdmin._id } },
      { new: true }
    );

    return res.status(200).json({ message: "Permission Updated Successfully", permissionGrantedto: subAdmin._id, pushUser });
  } catch (error) {
    console.error("Error granting permission:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function revokePermission(req, res) {
  try {
    const userId = req.user.id;
    const { _idorUsername } = req.body;

    const user = await User.findOne({ _id: userId, userType: "ADMIN", status: "ACTIVE" })

    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }

    if (user.userType !== "ADMIN") {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }

    const subAdmin = await User.findOne({ $or: [{ _id: _idorUsername }, { username: _idorUsername }], userType: "SUBADMIN", status: "ACTIVE" });

    if (!subAdmin) {
      return res.status(404).json({ message: "SubAdmin Not Found" });
    }

    subAdmin.permissionGrant = false; // Revoke permission
    await subAdmin.save();

    const pullUser = await User.findByIdAndUpdate(
      { _id : user._id },
      { $pull: { permissionsGranted: subAdmin._id } },
      { new: true }
    );

    return res.status(200).json({ message: "Permission Revoked Successfully", permissionRevokedFrom: subAdmin._id, pullUser });
  } catch (error) {
    console.error("Error revoking permission:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function twoFaRegister(req, res) {
  try {
    const Id = req.user.id;

    const data = await User.findOne({ _id: Id, status: "ACTIVE" });

    if (data.twoFaStatus === true) {

      const updated = await User.findByIdAndUpdate(
        { _id: Id },
        { $set: { twoFaStatus: false, secretKey: null } },
        { new: true }
      );

      return res.status(200).json({ message: "Two FA Disabled Successfully" })
    }

    if (data) {
      const secret = speakeasy.generateSecret({ length: 20 });
      // console.log(secret);
      const otp = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });
      // console.log(otp);

      // const subject = "OTP for Two Step Verification";
      // const text = `Your OTP is: ${otp}.`;

      const updated = await User.findByIdAndUpdate(
        { _id: Id, status: "ACTIVE" },
        { $set: { twoFaStatus: true, secretKey: secret.base32 } },
        { new: true }
      );

      return res.status(200).json({ message: "Two FA Enabled. Save this secret key into app like Google Authenticator to get the OTP. You will not see this key again", secret: secret.base32 });
    } else {
      return res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function bookSlot(req, res) {
  try {
    const userId = req.user.id;
    const data = await User.findOne({ _id: userId, status: "ACTIVE" });

    const { centreName, date, inputTimeSlot } = req.body;

    const isoDate = new Date(date.split("/").reverse().join("-"));
    // const isoDateToCheck = new Date(isoDate).toDateString();

    if (!data) {
      return res.status(404).json({ error: "User Not Found" });
    }
    if (!centreName || !date || !inputTimeSlot) {
      return res.status(404).json({ error: "All fields are required" });
    }

    const centre = await Centre.findOne({ name: centreName, status: "ACTIVE" })

    if (!centre) {
      return res.status(404).json({ error: "Centre Not Found" });
    }
    else {

      const dateEntry = centre.date.find((entry) => {
        const iDate = new Date(entry.date);
        return iDate.toISOString() === isoDate.toISOString();
      });

      console.log("=====>isDateExists", !(!dateEntry))

      if (!dateEntry) {
        return res.status(409).json({
          error: "Please specify another date. Centre will not be open on this date",
        });
      }

      const slot = dateEntry.slots.find(
        (slot) =>
          slot.slotTiming === inputTimeSlot && slot.user.length === 0
      );

      console.log("=====>isBooked", !slot);

      if (!slot) {
        return res.status(409).json({ error: "The Slot is already booked" });
      }

      const availableSlot = dateEntry.slots.find(
        (slot) =>
          slot.slotTiming === inputTimeSlot && slot.available === false
      );

      console.log("=====>isAvailable", !availableSlot);

      if (availableSlot) {
        return res.status(409).json({ error: "The Slot is on the breaktime" });
      }
    }

    const amount = parseInt(500 * 100);
    const options = {
      amount: amount,
      currency: "INR",
      receipt: req.body.email,
    };

    const payment = await razorpay.orders.create(options);
    console.log("centreName, date, slot===?>>>", centreName, (isoDate).toISOString(), inputTimeSlot);

    const x = await Centre.findOne(
      {
        name: centreName,
        'date': {
          $elemMatch: { date: new Date(isoDate).toISOString() }
        },
        'date.slots.slotTiming': inputTimeSlot,
      }
    )
    console.log("======>> x", x)

    const updatedCentre = await Centre.findOneAndUpdate(
      {
        name: centreName,
        'date.date': new Date(isoDate).toISOString(),
        'date.slots.slotTiming': inputTimeSlot,
      },
      {
        'date.$[outer].slots.$[inner].available': false,
        'date.$[outer].slots.$[inner].user': [userId],
        'date.$[outer].slots.$[inner].order_id': payment.id,
      },
      {
        arrayFilters: [
          { 'outer.date': new Date(isoDate).toISOString() },
          { 'inner.slotTiming': inputTimeSlot },
        ],
        new: true,
      }
    );

    console.log("==>>>>>>>>>updatedCentre", updatedCentre)

    // io.emit("booked", { requestType: "booked", userId: userId },
    //   console.log("============>>>       booked"));

    return res.status(200).json({ payment });

  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function webhook(req, res) {
  try {
    console.log("========>>> Webhook", req.body);

    const razorpaySignature = req.get("x-razorpay-signature");

    const {
      validateWebhookSignature,
    } = require("razorpay/dist/utils/razorpay-utils");
    webhookBodyNew = JSON.stringify(req.body).replace(/\//g, "\\/");
    const isValidSignature = validateWebhookSignature(
      webhookBodyNew,
      razorpaySignature,
      razorpayWebhookSecret
    );

    if (isValidSignature) {
      const webhookData = req.body;
      console.log(
        "Received webhook:",
        webhookData,
        "Payment Entity",
        webhookData.payload.payment.entity,
        "==>>>>entity order",
        webhookData.payload.order.entity
      );

      const orderId = webhookData.payload.payment.entity.order_id;
      const paymentId = webhookData.payload.payment.entity.id;
      const amount = webhookData.payload.payment.entity.amount;
      const status = webhookData.payload.order.entity.status;

      const newUser = new Order({
        orderId,
        paymentId,
        amount,
        status,
      });
      await newUser.save();

      return res.status(200).json({ message: "Webhook received successfully", newUser });
    } else {
      // Signature is not valid, reject the request
      console.error("Invalid webhook signature");
      io.on("start", (data) => {
        console.log(data)
      })
      return res.status(400).json({ message: "Invalid signature" });
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }

}

module.exports = {
  signup,
  login,
  twoFAVerfication,

  permissionGranting,
  revokePermission,
  createSubAdmin,
  deleteSubAdmin,
  getUserList,

  resendOTP,
  verifyOTP,
  twoFaRegister,
  forgotPassword,
  updatePassword,
  resetPassword,
  getUserProfile,
  updateEmail,
  deleteAccount,
  updateUserProfile,

  bookSlot,
  webhook,
};
