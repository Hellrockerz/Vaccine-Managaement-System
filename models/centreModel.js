const mongoose = require("mongoose");
const Schema = require("mongoose").Schema;
const mongoosePaginate = require('mongoose-paginate-v2');

const centreSchema = new Schema(
    {
        name: {
            type: String,
            required: true
        },
        availability: [{
            type: String,
            required: true
        }],
        location: {
            type: { type: String, default: 'Point' },
            coordinates: {
                type: [Number],
                index: '2dsphere',
            },
        },
        date: [{
            date: {
                type: String,
                required: true
            },
            slots: [{
                slotTiming: {
                    type: String,
                },
                available: {
                    type: Boolean,
                    default: true,
                },
                user: [{
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                }],
            }],
        }],
        status: {
            type: String,
            enum: ["ACTIVE", "DELETED"],
            default: "ACTIVE"
        },
    },
    { timestamps: true }
);

centreSchema.plugin(mongoosePaginate);
const centreModel = mongoose.model("centre", centreSchema);
module.exports = centreModel;
