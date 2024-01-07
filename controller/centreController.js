const User = require("../models/userModel");
const Centre = require("../models/centreModel");
const mongoose = require("mongoose");
const common = require("../helper/common");

async function createCentre(req, res) {
    try {
        const userId = req.user.id;
        const user = await User.findOne({ _id: userId, userType: { $in: ["ADMIN", "SUBADMIN"] }, status: "ACTIVE" });

        if (!user) {
            return res.status(404).json({ error: "User Not Found" });
        }

        const { name, availability, date, longitude, latitude, startTime, endTime, breakTimes, slotDuration, } = req.body;

        if (!name || !availability || !date || !longitude || !latitude || !startTime || !endTime || !breakTimes || !slotDuration) {
            return res.status(405).json({ error: "All Fields Are Required" });
        }

        const centreExists = await Centre.findOne({ name: name, status: "ACTIVE" })

        if (centreExists) {
            return res.status(405).json({ error: "Centre With This Name Already Exists" });
        }

        if (user.userType === "ADMIN" || user.permissionGrant === true) {
            const avDays = availability.map(common.numToDay);

            const isoDate = new Date(date.split("/").reverse().join("-"));

            console.log(isoDate);
            const existingCentre = await Centre.findOne({ name: name, status: "ACTIVE" });

            if (existingCentre) {
                return res.status(409).json({ error: "The Centre already exists." });
            }

            const currentDate = new Date();

            if (new Date(isoDate) < currentDate) {
                return res.status(407).json({ error: "Cannot enter a backdate or today's date" });
            }
            const day = new Date(isoDate).toDateString().slice(0, 3)

            if (!avDays.includes(day)) {
                return res.status(406).json({ message: `You have mentioned the centre is available ${avDays} but you mentioned the slots to be created on ${new Date(isoDate).toDateString()} which falls on ${day}` })
            }

            // const location = [parseFloat(longitude), parseFloat(latitude)];
            // console.log(location);

            const newCentre = new Centre({
                name,
                availability: avDays,
                location: {
                    coordinates: [parseFloat(longitude), parseFloat(latitude)],
                },
                date: [
                    {
                        date: (isoDate).toISOString(),
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

            return res.status(201).json({ message: "Centre created successfully", centre: savedCentre });

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
        const user = await User.findOne({ _id: userId, status: "ACTIVE" });

        if (!user) {
            return res.status(404).json({ error: "User Not Found" });
        }

        const currentDate = new Date().toISOString();

        console.log(currentDate)

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const pipeline1 = [
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [user.location.coordinates[0], user.location.coordinates[1]],
                    },
                    distanceField: "distance",
                    spherical: true,
                    includeLocs: "location",
                },
            },
            {
                $match: {
                    status: "ACTIVE",
                },
            },
            {
                $sort: {
                    distance: 1,
                },
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            },
            {
                $project: {
                    name: 1,
                    location: 1,
                    daysAvailable: "$availability",
                    distance: 1,
                    date: {
                        date: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$date",
                                        as: "date",
                                        cond: {
                                            $gte: ["$$date.date", currentDate],
                                        },
                                    },
                                },
                                as: "filteredDate",
                                in: {
                                    date: "$$filteredDate.date",
                                },
                            },
                        },
                        slots: {
                            slotTiming: 1,
                            available: 1
                        }
                    }
                }
            }
        ];
        const pipeline = [
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [user.location.coordinates[0], user.location.coordinates[1]],
                    },
                    distanceField: "distance",
                    spherical: true,
                    includeLocs: "location",
                },
            },
            {
                $match: {
                    status: "ACTIVE",
                },
            },
            {
                $sort: {
                    distance: 1,
                },
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            },
            {
                $project: {
                    name: 1,
                    location: 1,
                    daysAvailable: "$availability",
                    distance: 1,
                    date: {
                        $map: {
                            input: {
                                $filter: {
                                    input: "$date",
                                    as: "date",
                                    cond: {
                                        $gte: ["$$date.date", currentDate],
                                    },
                                },
                            },
                            as: "filteredDate",
                            in: {
                                date: "$$filteredDate.date",
                            },
                        },
                    },
                },
            },
        ];

        const result = await Centre.aggregatePaginate(Centre.aggregate(pipeline1));

        return res.status(200).json({ message: "Centre Fetched Successfully", centres: result });

    } catch (error) {
        console.error("Error in getCentreList:", error);
        return res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
}

async function updateCentre(req, res) {
    try {
        const userId = req.user.id;
        const userData = await User.findOne({ _id: userId, userType: { $in: ["ADMIN", "SUBADMIN"] }, status: "ACTIVE" });

        if (!userData) {
            return res.status(404).json({ error: "User Not Found or not Authorized" });
        }

        if (userData.userType === "ADMIN" || userData.permissionGrant === true) {
            const { id, name, availability, date, longitude, latitude, startTime, endTime, breakTimes, slotDuration } = req.body;

            if (!name || !availability || !date || !longitude || !latitude || !startTime || !endTime || !breakTimes || !slotDuration) {
                return res.status(405).json({ error: "All fields are Required" });
            }

            const centreData = await Centre.findOne({ _id: id, name: { $ne: name } });

            if (centreData) {
                return res.status(405).json({ error: "Centre Already Exists" });
            }

            if (!id) {
                return res.status(405).json({ error: "ID is Required" });
            }

            const isoDate = new Date(date.split("/").reverse().join("-"));

            const currentDate = new Date();

            if (new Date(isoDate) < currentDate) {
                return res.status(407).json({ error: "Cannot enter a backdate or today's date" });
            }

            const day = new Date(isoDate).toDateString().slice(0, 3)

            const avDays = availability.map((day) => common.numToDay(day));

            if (!avDays.includes(day)) {
                return res.status(406).json({ message: `You have mentioned the centre is available ${avDays} but you mentioned the slots to be created on ${new Date(isoDate).toDateString()} which falls on ${day}` })
            }

            const updatedCentre = await Centre.findOneAndUpdate(
                { _id: id, status: "ACTIVE" },
                {
                    $set: {
                        name,
                        availability: avDays,
                        location: {
                            coordinates: [parseFloat(longitude), parseFloat(latitude)],
                        },
                    },
                },
                { new: true }
            );
            console.log(updatedCentre)

            if (!updatedCentre) {
                return res.status(404).json({ error: "Centre Not Found or Deleted" });
            }

            // const formattedDate = new Date(isoDate).toDateString();

            const existingDateEntry = updatedCentre.date.find((entry) => entry.date === (isoDate).toISOString());

            if (existingDateEntry) {
                console.log("Same Date");
                existingDateEntry.slots = common.createSlots(startTime, endTime, breakTimes, slotDuration);

            } else {
                console.log("Diff Date");

                updatedCentre.date.push({
                    date: (isoDate).toISOString(),
                    slots: common.createSlots(startTime, endTime, breakTimes, slotDuration),
                });
            }
            await updatedCentre.save();

            return res.status(200).json({ message: "Centre Updated Successfully", updatedCentre });

        } else {
            return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal Server Error" });
    }
}

// async function addSlots(req, res) {
//     try {
//         const userId = req.user.id;
//         const userData = await User.findOne({ _id: userId, userType: { $in: ["ADMIN", "SUBADMIN"] }, status: "ACTIVE" });

//         if (!userData) {
//             return res.status(404).json({ error: "User Not Found" });
//         }

//         if (!(userData || userData.permissionGrant)) {
//             return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
//         }

//         const { id, date, startTime, endTime, breakTimes, slotDuration } = req.body;

//         if (!id || !date || !startTime || !endTime || !breakTimes || !slotDuration) {
//             return res.status(400).json({ error: "All Fields Are Required" });
//         }

//         const isoDate = new Date(date.split("/").reverse().join("-"));

//         if (userData || userData.permissionGrant) {   

//             const updatedCentre = await Centre.findOneAndUpdate(
//                 { _id: id, status: "ACTIVE", 'availability': { $in: [new Date(isoDate).slice(0, 3)] } },
//                 {
//                     $addToSet: {
//                         date: {
//                             $each: [
//                                 {
//                                     date: (isoDate).toISOString(),
//                                     slots: common.createSlots(startTime, endTime, breakTimes, slotDuration),
//                                 },
//                             ],
//                         },
//                     },
//                 },
//                 { new: true }
//             );

//             if (!updatedCentre) {
//                 return res.status(404).json({ error: "Centre Not Found or Not Active or the centre you provided falls on the day its not available." });
//             }

//             return res.status(200).json({ message: "Slots added successfully", centre: updatedCentre })
//         } else {
//             return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });
//         }

//     } catch (error) {
//         console.error("Error in addSlots:", error);
//         return res.status(500).json({ error: "Internal Server Error" });
//     }
// }

async function getSlotsList(req, res) {
    try {
        const userId = req.user.id;
        const user = await User.findOne({ _id: userId });

        if (!user) {
            return res.status(404).json({ error: "User Not Found" });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const { centreId, date } = req.body;
        const isoDate = new Date(date.split("/").reverse().join("-"));

        const pipeline = [
            {
                $geoNear: {
                    near: {
                        type: "Point",
                        coordinates: [user.location.coordinates[0], user.location.coordinates[1]],
                    },
                    distanceField: "distance",
                    spherical: true,
                    includeLocs: "location",
                },
            },
            {
                $sort: {
                    distance: 1,
                },
            },
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(centreId),
                    'date.date': new Date(isoDate),
                    status: 'ACTIVE',
                },
            },
            {
                $unwind: '$date',
            },
            {
                $unwind: '$date.slots',
            },
            {
                $match: { 'date.slots.available': true },
            },
            {
                $group: {
                    _id: '$date.date',
                    slots: {
                        $push: {
                            timings: '$date.slots.slotTiming',
                            available: '$date.slots.available',
                        },
                    },
                    totalAvailableSlots: { $sum: 1 },
                },
            },
            {
                $match: {
                    '_id': new Date(isoDate),
                },
            },
            {
                $skip: skip
            },
            {
                $limit: limit
            },
            {
                $project: {
                    name: 1,
                    location: 1,
                    distance: 1,
                    slots: 1,
                    totalAvailableSlots: 1,
                },
            },
        ];

        const result = await Centre.aggregatePaginate(Centre.aggregate(pipeline));


        return res.status(200).json({ message: 'Slots Fetched Successfully', result });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

async function deleteCentre(req, res) {
    try {
        const userId = req.user.id;
        const data = await User.findOne({ _id: userId, userType: { $in: ["ADMIN", "SUBADMIN"] }, status: "ACTIVE" });
        const { centreId } = req.body;

        if (!data) {
            return res.status(404).json({ error: "User Not Found or not AUTHORIZED" });
        }

        if (!centreId) {
            return res.status(404).json({ error: "centreId is required" });
        }

        if (!(data.userType === "ADMIN" || data.permissionGrant === true)) {
            return res.status(401).json({ message: "YOU ARE NOT AUTHORIZED" });

        } else {
            const data = await Centre.findOne({ _id: centreId, status: "ACTIVE" });

            if (data) {
                const deletedCentre = await Centre.findByIdAndUpdate(
                    { _id: centreId },
                    {
                        $set: {
                            status: "DELETED",
                        },
                    },
                    { new: true }
                );
                return res.status(200).json({ message: "Centre deleted successfully", deletedCentre });

            } else {
                return res.status(404).json({ error: "Specified Centre has already been deleted or not found" });
            }
        }
    } catch (error) {
        console.error("Error saving user:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = {
    createCentre,
    updateCentre,
    deleteCentre,
    getCentreList,
    // addSlots,
    getSlotsList,

};

// try {
//     const page = parseInt(req.query.page) || 1; // default to page 1 if not provided
//     const limit = parseInt(req.query.limit) || 10; // default to 10 items per page if not provided

//     let options = {
//       page: parseInt(page) || 1,
//       limit: parseInt(limit) || 10,
//       sort: { createdAt: -1 },
//     };

//     const toDate = req.query.toDate;
//     const fromDate = req.query.fromDate;

//     let query = { status: "ACTIVE", isWin: true };

//     if (fromDate && !toDate) {
//       query.createdAt = { $gte: fromDate };
//     }
//     if (!fromDate && toDate) {
//       query.createdAt = { $lte: toDate };
//     }
//     if (fromDate && toDate) {
//       query.$and = [
//         { createdAt: { $gte: fromDate } },
//         { createdAt: { $lte: toDate } },
//       ];
//     }
//     const latestGame = await gameHistoryModel.paginate(query, options);

//     res.status(200).json({
//       statusCode: 200,
//       responseMessage: "Data found successfully!",
//       responseResult: latestGame,
//     });

//   } catch (error) {
//     console.error(error);
//     res.status(501).json({
//       statusCode: 501,
//       responseMessage: "Server Error!",
//     });
//   }
