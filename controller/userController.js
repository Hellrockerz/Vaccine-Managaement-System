const tokenGenerator = require("../auth/auth").tokenGenerator;
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
const io = require("../index").io;

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
    const existingUser = await User.findOne({ $or: [{ email }, { mobileNo }], status: "ACTIVE" });

    if (existingUser && existingUser.OTPVerification)
      return res.status(402).json({ message: "User Already Exists." });

    if (existingUser && existingUser.email == email && existingUser.mobileNo != mobileNo)
      return res.status(401).json({ message: "Enter Correct Number associated with the Email" });

    if (existingUser && existingUser.mobileNo == mobileNo && existingUser.email !== email)
      return res.status(402).json({ message: "Enter Correct Email associated with the Number." });

    if (!existingUser || password !== cPassword)
      return res.status(existingUser ? 403 : 405).json({
        message: existingUser ? "Password and Confirm Password must be the same" : "All Fields Are Required"
      });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userToUpdate = existingUser || new User();

    Object.assign(userToUpdate, {
      firstName, lastName, username, password: hashedPassword, email, mobileNo,
      location: { coordinates: [parseFloat(longitude), parseFloat(latitude)] },
      OTP: otp, expTime: OTPTime
    });

    const updatedUser = await userToUpdate.save();
    await common.sendMail(email, subject, text);

    return res.status(existingUser ? 201 : 200).json({
      message: "Signed Up Successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function verifyOTP(req, res) {
  const { email, mobileNo, otp } = req.body;

  try {
    const user = await User.findOne({ $or: [{ email }, { mobileNo }], status: "ACTIVE" });

    if (!user) {
      return res.status(404).json({ message: "User is not Signed Up" });
    }

    const currentTime = Date.now();

    if (currentTime <= user.expTime) {
      const isCorrectOTP = otp === user.OTP;

      const updatedUser = await User.findByIdAndUpdate(
        { _id: user._id }, 
        { $set: { OTPVerification: isCorrectOTP } }, 
        { new: true });

      if (isCorrectOTP && updatedUser) {
        return res.status(200).json({ message: "OTP Verified Successfully" });
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

async function resendOTP(req, res) {
  try {
    const data = await User.findOne({ email: req.body.email });
    if (!data) {
      res.status(404).json({ message: "User is not Signed Up" });
    } else {
      try {
        const newOTP = common.generateOTP();
        const expTime = Date.now() + 5 * 60 * 1000;
        let subject = `New OTP`;
        let text = `Your new OTP is :${newOTP}`;
        common.sendMail(req.body.email, subject, text);
        await User.findByIdAndUpdate(
          { _id: data._id },
          { $set: { expTime: expTime, OTP: newOTP } }
        );
        res
          .status(201)
          .json({ message: "OTP resent succesfully", "New OTP": newOTP });
      } catch (error) {
        res.status(400).json({ error: "OTP Not Sent" });
        console.error(error);
      }
    }
  } catch (error) {
    res.status(500).json({ error: "Internal Server Error" });
    console.error(error);
  }
}

async function login(req, res) {
  try {
    const { email, mobileNo, password, otp } = req.body;
    const user = await User.findOne({ $or: [{ email: email }, { mobileNo: mobileNo }], status: "ACTIVE" });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.OTPVerification) {
      return res.status(401).json({ message: "OTP not verified. Cannot log in." });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (isPasswordCorrect) {
      if (!user.twoFaStatus) {
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
    }

    return res.status(404).json({ message: "Incorrect Password" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}


async function getUserList(req, res) {
  try {
    const Id = req.user.id;
    const data = await User.findOne({ _id: Id, userType:"ADMIN", status: "ACTIVE" });

    if (!data) {
      return res.status(404).json({ message: "User does not Exist" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const options = {
      page,
      limit,
    };

    const result = await User.paginate({ status: "ACTIVE" }, options);

    const userData = result.docs.map((user) => ({
      _id: user._id,
      username: user.username,
      email: user.email,
      userType: user.userType,
      status: user.status,
    }));

    const pageInfo = {
      total: result.totalDocs,
      currentPage: result.page,
      perPage: result.limit,
      totalPages: result.pagingCounter,
    };

    return res.status(200).json({ message: userData, pageInfo });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
}

async function createSubAdmin(req, res) {
  try {
    const id = req.user.id;
    const { firstName, lastName, email, mobileNo, password } = req.body;

    const admin = await User.findOne({ _id: id });

    if (!admin) {
      return res.status(404).json({ message: "User does not Exist" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const subAdminExists = await User.findOne({$or: [{mobileNo : mobileNo}, {email: email}], userType: "SUBADMIN"})
    if (subAdminExists) {
      return res.status(402).json({ message: "SUBADMIN Already Exist" });
    }

    if (admin.userType === "ADMIN" || admin.permissionGrant) {
      const m = mobileNo.toString();
      const username = firstName.toLowerCase() + m.slice(-4);
      const subject = "Vaccination Management System";
      const text = `You have been appointed as SubAdmin\nBelow are your credentials.\nNEVER SHARE YOUR CREDENTIALS WITH ANYONE\n email: ${email}\nmobileNo:${mobileNo}\npassword:${password}`;

      await common.sendMail(email, subject, text);

      const subAdmin = new User({
        firstName,
        lastName,
        username,
        password: hashedPassword,
        OTPVerification: true,
        email,
        mobileNo,
        location: {
          coordinates: [parseFloat(req.body.longitude), parseFloat(req.body.latitude)],
        },
        userType: "SUBADMIN",
        permissionGrant: false,
      });

      const newSubAdmin = await subAdmin.save();

      return res.status(200).json({
        message: "Sub Admin created successfully and they have been notified through email",
        newSubAdmin,
      });
    } else {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function deleteSubAdmin(req, res) {
  try {
    const userId = req.user.id;
    const data = await User.findOne({ _id: userId });
    const { subAdminid } = req.body;
    if (!data) {
      return res.status(404).json({ error: "User Not Found" });
    }
    if (!subAdminid) {
      return res.status(404).json({ error: "subAdminid is required" });
    }
    if (data.userType == "ADMIN" || data.permissionGrant) {
      const data = await User.findOne({
        _id: subAdminid,
        userType: "SUBADMIN",
      });
      if (data) {
        if (data.status == "DELETED") {
          return res
            .status(404)
            .json({ error: "Specified SubAdmin Already Delted" });
        }
        const deletedSubAdmin = await User.findByIdAndUpdate(
          { _id: subAdminid },
          {
            $set: {
              status: "DELETED",
            },
          },
          { new: true }
        );
        return res
          .status(200)
          .json({ message: "Subadmin deleted successfully", deletedSubAdmin });
      } else {
        return res.status(404).json({ error: "Specified SubAdmin not found" });
      }
    } else {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function permissionGranting(req, res) {
  try {
    const Id = req.user.id;
    const { _id, username } = req.body;
    const subAdmin = await User.findOne({
      $or: [
        { _id: Id, userType: "ADMIN" },
        { username: username, userType: "SUBADMIN" },
      ],
    });
    const data = await User.findOne({ _id: Id });
    if (!data || !subAdmin) {
      return res.status(404).json({ message: "User does not Exist" });
    }
    if (data.userType == "ADMIN") {
      const permissiontoCreate = await User.findByIdAndUpdate(
        { _id: _id },
        { $set: { permissionGrant: true } },
        { new: true }
      );
      x = await User.findOne({ userType: "ADMIN" });
      console.log("=======>>>>>", x);
      const pushUser = await User.findOneAndUpdate(
        { userType: "ADMIN" },
        { $push: { permissionsGranted: _id } },
        { new: true }
      );
      console.log(pushUser);
      res.status(200).json({
        message: "Permission Updated Succesfully",
        permissiontoCreate,
        pushUser,
      });
    } else {
      res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function twoFaRegister(req, res) {
  try {
    const Id = req.user.id;
    const data = await User.findOne({ _id: Id });

    if (data) {
      const secret = speakeasy.generateSecret({ length: 20 });
      console.log(secret);
      const otp = speakeasy.totp({
        secret: secret.base32,
        encoding: "base32",
      });
      console.log(otp);
      let subject = "OTP for Two Step Verification";
      let text = `Your OTP is: ${otp}.`;
      await common.sendMail(data.email, subject, text);
      const setSecretKey = await User.findOneAndUpdate(
        { _id: data._id },
        { $set: { twoFaStatus: true, secretKey: secret.base32 } },
        { new: true }
      );
      return res
        .status(200)
        .json({ message: "OTP sent to you email successfully", otp });
    } else {
      return res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function createCentre(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ error: "User Not Found" });
    }

    const {
      name,
      availability,
      date,
      longitude,
      latitude,
      startTime,
      endTime,
      breakTimes,
      slotDuration,
    } = req.body;

    if (
      !name ||
      !availability ||
      !date ||
      !longitude ||
      !latitude ||
      !startTime ||
      !endTime ||
      !breakTimes ||
      !slotDuration
    ) {
      return res.status(405).json({ error: "All Fields Are Required" });
    }

    if (user.userType === "ADMIN" || user.userType === "SUBADMIN") {
      const avDays = availability.map(common.numToDay);

      const isoDate = new Date(date.split("/").reverse().join("-")).toISOString();

      const existingCentre = await Centre.findOne({ name: name });

      if (existingCentre) {
        return res.status(409).json({
          error:
            "The Centre already exists.",
        });
      }

      const day = new Date(isoDate).toDateString().slice(0, 3)

      if (!avDays.includes(day)) {
        return res.status(406).json({ message: `You have mentioned the centre is available ${avDays} but you mentioned the slots to be created on ${new Date(isoDate).toDateString()} which falls on ${day}` })
      }

      const location = [parseFloat(longitude), parseFloat(latitude)];
      console.log(location);

      const newCentre = new Centre({
        name,
        availability: avDays,
        location: {
          coordinates: [parseFloat(longitude), parseFloat(latitude)],
        },
        date: [
          {
            date: new Date(isoDate).toDateString(),
            slots: common.createSlots(
              startTime,
              endTime,
              breakTimes,
              slotDuration
            ),
          },
        ],
      });
      const savedCentre = await newCentre.save();

      return res
        .status(201)
        .json({ message: "Centre created successfully", centre: savedCentre });
    } else {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getCentreList(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ error: "User Not Found" });
    }
    console.log(user.location.coordinates)

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const options = {
      page,
      limit,
    };

    const result = await Centre.aggregate([
      {
        $geoNear: {
          near: {
            type: "Point",
            coordinates: [user.location.coordinates[0], user.location.coordinates[1]],
          },
          distanceField: "distance",
          spherical: true,
        },
      },
      {
        $sort: {
          distance: 1, // 1 for ascending, -1 for descending
        },
      },
      { $match: { status: "ACTIVE" } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ]);

    console.log(result)

    const userData = result.map((i) => ({
      _id: i._id,
      name: i.name,
      location: i.location,
      daysAvailable: i.availability,
      distance: i.distance,
    }));

    const pageInfo = {
      total: userData.length,
      currentPage: page,
      perPage: limit,
      totalPages: Math.ceil(userData.length / limit),
    };
    return res
      .status(200)
      .json({ message: "Centre Fetched Successfully", userData, pageInfo });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ message: "Internal Server Error", error: error.message });
  }
}

async function updateCentre(req, res) {
  try {
    const userId = req.user.id;
    const userData = await User.findOne({ _id: userId });

    if (!userData) {
      return res.status(404).json({ error: "User Not Found" });
    }

    if (userData.userType === "ADMIN" || userData.userType === "SUBADMIN") {
      const { id, name, availability, date, longitude, latitude, startTime, endTime, breakTimes, slotDuration } = req.body;

      if (!name || !availability || !date || !longitude || !latitude || !startTime || !endTime || !breakTimes || !slotDuration) {
        return res.status(405).json({ error: "All fields are Required" });
      }

      if (!id) {
        return res.status(405).json({ error: "ID is Required" });
      }

      const avDays = availability.map((day) => common.numToDay(day));
      const isoDate = new Date(
        date.split("/").reverse().join("-")
      ).toISOString();

      const updatedCentre = await Centre.findOneAndUpdate(
        { _id: id },
        {
          $set: {
            name,
            availability: avDays,
            location: {
              coordinates: [parseFloat(longitude), parseFloat(latitude)],
            },
            date: [
              {
                date: new Date(isoDate).toDateString(),
                slots: common.createSlots(
                  startTime,
                  endTime,
                  breakTimes,
                  slotDuration
                ),
              },
            ],
          },
        },
        { new: true }
      );

      if (!updatedCentre) {
        return res.status(404).json({ error: "Centre Not Found" });
      }
      return res
        .status(200)
        .json({ message: "Centre Updated Successfully", updatedCentre });

    } else {
      res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function addSlots(req, res) {
  try {
    const userId = req.user.id;
    const userData = await User.findOne({ _id: userId });

    if (!userData) {
      return res.status(404).json({ error: "User Not Found" });
    }

    if (userData.userType === "ADMIN" || userData.userType === "SUBADMIN") {
      const { id, date, startTime, endTime, breakTimes, slotDuration } = req.body;

      if (!id || !date || !startTime || !endTime || !breakTimes || !slotDuration) {
        return res.status(400).json({ error: "All Fields Are Required" });
      }

      const isoDate = new Date(date.split("/").reverse().join("-")).toISOString();

      const existingCentre = await Centre.findOne({ _id: id })
      const daysArray = existingCentre.availability
      const day = new Date(isoDate).toDateString().slice(0, 3)

      if (!daysArray.includes(day)) {
        return res.status(406).json({ message: "The centre is not available on this day" })
      }
      const isoDateToCheck = new Date(isoDate);

      const dateExists = existingCentre.date.some((i) => {
        const iDate = new Date(i.date);
        return iDate.toISOString() === isoDateToCheck.toISOString();
      });

      if (dateExists) {
        return res.status(409).json({ error: "Please specify another date. Slots for this date have already been created.", });
      }
      const centre = await Centre.findOneAndUpdate(
        { _id: id, status: "ACTIVE" },
        {
          $push: {
            date: [
              {
                date: new Date(isoDate).toDateString(),
                slots: common.createSlots(startTime, endTime, breakTimes, slotDuration),
              },
            ],
          },
        },
        { upsert: true, new: true }
      )
      if (!centre) {
        return res.status(404).json({ error: "Centre Not Found or Not Active" });
      }

      return res.status(200).json({ message: "Slots added successfully", centre });
    } else {
      return res.status(403).json({ error: "Permission Denied" });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
}

async function getSlotsList(req, res) {
  try {
    const userId = req.user.id;
    const user = await User.findOne({ _id: userId });

    if (!user) {
      return res.status(404).json({ error: "User Not Found" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const options = {
      page,
      limit,
    };
    const { centreId, date } = req.body

    const isoDate = new Date(date.split("/").reverse().join("-")).toISOString();
    console.log(new Date(isoDate).toDateString())
    const result = await Centre.paginate(
      { _id: centreId, 'date.date': new Date(isoDate).toDateString(), status: 'ACTIVE' },
      options
    );
    // if (result.docs.length === 0) {
    //   return res.status(404).json({ error: 'No slots available for the specified date' });
    // }

    console.log(result)

    const slotsData = result.docs.map((center) => ({
      name: center.name,
      date: center.date.map((slot) => ({
        slotTiming: slot.slotTiming,
        available: slot.available,
        user: slot.user,
        _id: slot._id,
        date: new Date(slot.date).toDateString(),
        slots: slot.slots
      })),
    }));

    const pageInfo = {
      total: result.totalDocs,
      currentPage: result.page,
      perPage: result.limit,
      totalPages: result.totalPages,
    };
    return res.status(200).json({ message: 'Slots Fetched Successfully', slotsData, pageInfo });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
}

async function deleteCentre(req, res) {
  try {
    const userId = req.user.id;
    const data = await User.findOne({ _id: userId });
    const { centreId } = req.body;
    if (!data) {
      return res.status(404).json({ error: "User Not Found" });
    }
    if (!centreId) {
      return res.status(404).json({ error: "centreId is required" });
    }
    if (data.userType == "ADMIN" || data.permissionGrant) {
      const data = await Centre.findOne({ _id: centreId });
      if (data) {
        if (data.status == "DELETED") {
          return res
            .status(404)
            .json({ error: "Specified Centre Is Already Deleted" });
        }
        const deletedCentre = await Centre.findByIdAndUpdate(
          { _id: centreId },
          {
            $set: {
              status: "DELETED",
            },
          },
          { new: true }
        );
        return res
          .status(200)
          .json({ message: "Centre deleted successfully", deletedCentre });
      } else {
        return res.status(404).json({ error: "Specified Centre not found" });
      }
    } else {
      return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
    }
  } catch (error) {
    console.error("Error saving user:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function bookSlot(req, res) {
  try {
    const userId = req.user.id;
    const data = await User.findOne({ _id: userId, status: "ACTIVE" });

    const { centreName, date, inputTimeSlot } = req.body;
    const isoDate = new Date(date.split("/").reverse().join("-")).toISOString();
    const isoDateToCheck = new Date(isoDate).toDateString();

    if (!data) {
      return res.status(404).json({ error: "User Not Found" });
    }
    if (!centreName || !date || !inputTimeSlot) {
      return res.status(404).json({ error: "All fields are required" });
    }

    const centre = await Centre.findOne({ name: centreName, status: "ACTIVE" })

    if (!centre) {
      return res.status(404).json({ error: "centre Not Found" });
    } else {

      const dateExists = centre.date.some((i) => {
        const iDate = new Date(i.date).toDateString();
        return iDate === isoDateToCheck;
      })

      if (!dateExists) {
        return res.status(409).json({ error: "Please specify another date. Centre will not be open on this date" });
      }

      const isBooked = centre.date.some(dateEntry => {
        return dateEntry.slots.some(slot => slot.slotTiming === inputTimeSlot && slot.user.length === 0);
      });

      if (!isBooked) {
        return res.status(409).json({ error: "The Slot is already booked" });
      }

      const available = centre.date.some(dateEntry => {
        return dateEntry.slots.some(slot => slot.slotTiming === inputTimeSlot && slot.available);
      });

      if (!available) {
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
    console.log("centreName, date, slot===?>>>", centreName, date, inputTimeSlot);

    io.emit("start", (data) => {
      centreName, date, inputTimeSlot, payment;
      console.log("Transaction Initiated")
    })

    // const x = await Centre.findOne(
    //   {
    //     name: centreName,
    //     'date.date': isoDateToCheck,
    //     'date.slots.slotTiming': inputTimeSlot,
    //   }
    // )
    // console.log("======>> x", x)

    const updatedCentre = await Centre.findOneAndUpdate(
      {
        name: centreName,
        'date.date': isoDateToCheck,
        'date.slots.slotTiming': inputTimeSlot,
      },
      {
        $set: {
          'date.$.slots.$[inner].available': false,
          'date.$.slots.$[inner].user': [userId],
          'date.$.slots.$[inner].order_id': payment.id,
        },
      },
      {
        arrayFilters: [
          { 'inner.slotTiming': inputTimeSlot },
        ],
        new: true,
      }
    );

    console.log("==>>>>>>>>>updatedCentre",updatedCentre)
    
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

      res
        .status(200)
        .json({ message: "Webhook received successfully", newUser });
    } else {
      // Signature is not valid, reject the request
      console.error("Invalid webhook signature");
      res.status(400).json({ message: "Invalid signature" });
      io.on("start", (data) => {
        console.log(data)
      })
    }
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }

}

module.exports = {
  signup,
  login,
  verifyOTP,
  createSubAdmin,
  deleteSubAdmin,
  resendOTP,
  permissionGranting,
  twoFaRegister,
  createCentre,
  updateCentre,
  deleteCentre,
  getUserList,
  getCentreList,
  bookSlot,
  webhook,
  addSlots,
  getSlotsList
};
