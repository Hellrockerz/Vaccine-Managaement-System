const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const aggregatePaginate = require('mongoose-aggregate-paginate-v2')

const OrderSchema = new mongoose.Schema({
    
    orderId:{
        type: String
    },
    paymentId:{
        type:String,
    },
    amount:{
        type:Number
    },
    status:{
        type:String
    }}, 
    
    {timestamps: true});

OrderSchema.plugin(mongoosePaginate);
OrderSchema.plugin(aggregatePaginate);
const Order = mongoose.model('Order', OrderSchema);
module.exports = Order;